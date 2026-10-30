"""Informativo meteorológico (nº/AAAA): API interna do compositor, do acompanhamento e do histórico + endpoint público somente leitura.

O texto é gerado por `core/informativos.py` a partir da matriz por REDEC (`InformativoRegiao`). O painel NÃO envia nada (SMS, WhatsApp, Telegram):
registra o que a equipe enviou. Documentação: docs/informativo-meteorologico.md."""

from __future__ import annotations

import csv
import datetime as dt

from django.db import IntegrityError, transaction
from django.db.models import Max
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core import informativo_apoio as apoio
from core import informativos as inf
from core import informativo_envios as envios_regras
from core.models import ConfiguracaoInformativo, InformativoEnvio, InformativoMeteorologico, InformativoRegiao

CAMPOS_REGIAO = ("chuva_atual", "raios_atual", "chuva_prevista", "vento_previsto", "raios", "granizo", "isolada")
ACOES = {"revisar": "revisado", "enviar": "enviado", "cancelar": "cancelado"}


def _usuario(request) -> str:
    return (request.user.get_full_name() or request.user.get_username()).strip()


def _agora_local() -> dt.datetime:
    return timezone.localtime(timezone.now())


def _itens(i: InformativoMeteorologico) -> list[dict]:
    return [
        {"regiao": r.regiao, **{c: getattr(r, c) for c in CAMPOS_REGIAO}, "sms_enviado": r.sms_enviado, "sms_enviado_em": r.sms_enviado_em}
        for r in i.regioes.all()
    ]


def _aproximacao(i: InformativoMeteorologico) -> dict | None:
    if not i.aproximacao_regioes:
        return None
    return {"regioes": i.aproximacao_regioes, "intensidade": i.aproximacao_intensidade, "por": i.aproximacao_por}


def _gerar_texto(i: InformativoMeteorologico, itens: list[dict] | None = None) -> str:
    emitido = timezone.localtime(i.emitido_em) if i.emitido_em else _agora_local()
    return inf.montar_texto(i.numero, i.ano, emitido, itens if itens is not None else _itens(i), _aproximacao(i), ConfiguracaoInformativo.obter().rodape)


def _texto_ou_gerado(i: InformativoMeteorologico) -> str:
    """Informativo antigo importado da planilha não tem texto gravado (a planilha só tem a matriz): mostra o texto gerado por ela, sem gravar. Sem matriz e sem texto, fica vazio."""
    return i.texto if i.texto or not i.regioes.exists() else _gerar_texto(i)


def _vigente_ate(i: InformativoMeteorologico) -> dt.datetime | None:
    base = i.enviado_em or i.emitido_em
    return base + dt.timedelta(hours=ConfiguracaoInformativo.obter().validade_horas) if base else None


def _registra(i: InformativoMeteorologico, usuario: str, acao: str, detalhe: str = "") -> None:
    i.historico = [*i.historico, {"em": timezone.now().isoformat(), "por": usuario, "acao": acao, "detalhe": detalhe}]


def _envio(e: InformativoEnvio) -> dict:
    return {
        "id": e.id, "tipo": e.tipo, "canal": e.canal, "detalhe": e.detalhe, "quadro_em": e.quadro_em, "regioes": e.regioes, "protocolo": e.protocolo,
        "autorizado_por": e.autorizado_por, "observacao": e.observacao, "enviado_em": e.enviado_em, "enviado_por": e.enviado_por,
        "validado_em": e.validado_em, "validado_por": e.validado_por,
    }


def _serializa(i: InformativoMeteorologico, detalhe: bool = True) -> dict:
    itens = _itens(i)
    out = {
        "id": i.id,
        "numero": i.numero,
        "ano": i.ano,
        "estado": i.estado,
        "emitido_em": i.emitido_em,
        "vigente_ate": _vigente_ate(i),
        "publico": i.publico,
        "importado": i.importado,
        "regioes": [x["regiao"] for x in itens if x["chuva_atual"] or x["chuva_prevista"]],
        "maior_gravidade": inf.maior_gravidade(itens)[0],
        "sms_regioes": [x["regiao"] for x in itens if x["sms_enviado"]],
        "enviado_em": i.enviado_em,
        "enviado_por": i.enviado_por,
        "criado_por": i.criado_por,
    }
    if detalhe:
        g, raios = inf.maior_gravidade(itens)
        out.update(
            texto=_texto_ou_gerado(i),
            texto_livre=i.texto_livre,
            editado_a_mao=bool(i.texto and i.texto_gerado and i.texto != i.texto_gerado),
            itens=itens,
            aproximacao=_aproximacao(i) or {"regioes": [], "intensidade": "", "por": ""},
            radar_fonte=i.radar_fonte,
            radar_quadro_em=i.radar_quadro_em,
            observacao=i.observacao,
            motivo_cancelamento=i.motivo_cancelamento,
            revisado_por=i.revisado_por,
            revisado_em=i.revisado_em,
            historico=i.historico,
            envios=[_envio(e) for e in i.envios.all()],
            nm_sugerido=[{"regiao": x["regiao"], "nm": inf.nm_sugerido(x)[0], "so_a_pedido": inf.nm_sugerido(x)[1]} for x in itens if x["chuva_prevista"]],
            sms=inf.texto_sms(itens),
            livro_ocorrencias=inf.frase_livro_ocorrencias(i.numero, i.ano, timezone.localtime(i.enviado_em or i.emitido_em or timezone.now()), itens),
            maior_gravidade_raios=raios,
            radar_intervalo_min=inf.intervalo_radar_min(g, raios, (timezone.localtime(i.emitido_em) if i.emitido_em else _agora_local()).hour, ConfiguracaoInformativo.obter().cadencia_radar_min or None)[0],
        )
    return out


def _grava_itens(i: InformativoMeteorologico, itens: list[dict]) -> None:
    mantidos = {}
    for bruto in itens or []:
        regioes = inf.normalizar_regiao(str(bruto.get("regiao", "")))
        for reg in regioes:
            mantidos[reg] = bruto
    i.regioes.exclude(regiao__in=list(mantidos)).delete()
    for reg, bruto in mantidos.items():
        valores = {
            "chuva_atual": inf.normalizar_intensidade(str(bruto.get("chuva_atual") or "")) if bruto.get("chuva_atual") not in INTENSIDADES_VALIDAS else bruto.get("chuva_atual"),
            "chuva_prevista": inf.normalizar_intensidade(str(bruto.get("chuva_prevista") or "")) if bruto.get("chuva_prevista") not in INTENSIDADES_VALIDAS else bruto.get("chuva_prevista"),
            "vento_previsto": bruto.get("vento_previsto") if bruto.get("vento_previsto") in inf.RAJADAS else "",
            "raios_atual": bool(bruto.get("raios_atual")),
            "raios": bool(bruto.get("raios")),
            "granizo": bool(bruto.get("granizo")),
            "isolada": bool(bruto.get("isolada")),
        }
        InformativoRegiao.objects.update_or_create(informativo=i, regiao=reg, defaults=valores)


INTENSIDADES_VALIDAS = set(inf.INTENSIDADES)


def _cria(usuario: str, dados: dict) -> InformativoMeteorologico:
    """Reserva o número seguinte do ano (reinicia em 1 a cada ano); repete se duas pessoas criarem ao mesmo tempo."""
    emitido = parse_datetime(dados["emitido_em"]) if dados.get("emitido_em") else None
    if emitido and timezone.is_naive(emitido):
        emitido = timezone.make_aware(emitido)
    emitido = emitido or timezone.now()
    ano = timezone.localtime(emitido).year
    for _ in range(5):
        try:
            with transaction.atomic():
                numero = (InformativoMeteorologico.objects.filter(ano=ano).aggregate(m=Max("numero"))["m"] or 0) + 1
                i = InformativoMeteorologico.objects.create(
                    numero=numero, ano=ano, emitido_em=emitido, criado_por=usuario,
                    radar_fonte=ConfiguracaoInformativo.obter().radar_fonte,
                )
            return i
        except IntegrityError:
            continue
    raise IntegrityError("Não foi possível reservar o número do informativo.")


class InformativosView(APIView):
    """GET: histórico (filtros `ano`, `estado`, `regiao`, `de`, `ate`). POST: cria rascunho (reserva o número) — `duplicar_de` copia a matriz de outro."""

    def get(self, request):
        qs = InformativoMeteorologico.objects.prefetch_related("regioes")
        p = request.query_params
        if p.get("ano"):
            qs = qs.filter(ano=int(p["ano"]))
        if p.get("estado"):
            qs = qs.filter(estado=p["estado"])
        if p.get("regiao"):
            qs = qs.filter(regioes__regiao=p["regiao"].upper()).distinct()
        if p.get("de"):
            qs = qs.filter(emitido_em__date__gte=p["de"])
        if p.get("ate"):
            qs = qs.filter(emitido_em__date__lte=p["ate"])
        limite = min(int(p.get("limite", 100)), 500)
        itens = list(qs.order_by("-ano", "-numero")[:limite])
        return Response({"informativos": [_serializa(i, detalhe=False) for i in itens], "proximo_numero": _proximo_numero()})

    def post(self, request):
        usuario = _usuario(request)
        d = request.data or {}
        with transaction.atomic():
            i = _cria(usuario, d)
            origem = None
            if d.get("duplicar_de"):
                origem = InformativoMeteorologico.objects.filter(pk=d["duplicar_de"]).first()
            if origem:
                _grava_itens(i, [{**x, "regiao": x["regiao"]} for x in _itens(origem)])
                i.aproximacao_regioes, i.aproximacao_por, i.aproximacao_intensidade = origem.aproximacao_regioes, origem.aproximacao_por, origem.aproximacao_intensidade
            elif d.get("itens"):
                _grava_itens(i, d["itens"])
            i.texto = i.texto_gerado = _gerar_texto(i)
            _registra(i, usuario, "criou", f"duplicado do nº {origem.numero}/{origem.ano}" if origem else "")
            i.save()
        return Response(_serializa(i), status=201)


def _proximo_numero() -> dict:
    ano = _agora_local().year
    return {"ano": ano, "numero": (InformativoMeteorologico.objects.filter(ano=ano).aggregate(m=Max("numero"))["m"] or 0) + 1}


class InformativoDetalheView(APIView):
    """GET: informativo completo. PATCH: edita matriz, aproximação, observação, data/hora e texto. O texto só é regerado se não foi ajustado à mão
    (ou se vier `regenerar_texto`); enviado/cancelado não se edita (cancele e crie outro, ou use `observacao`)."""

    def get(self, request, pk):
        try:
            return Response(_serializa(InformativoMeteorologico.objects.get(pk=pk)))
        except InformativoMeteorologico.DoesNotExist:
            return Response({"detail": "Informativo não encontrado."}, status=404)

    def patch(self, request, pk):
        usuario = _usuario(request)
        d = request.data or {}
        with transaction.atomic():
            try:
                i = InformativoMeteorologico.objects.select_for_update().get(pk=pk)
            except InformativoMeteorologico.DoesNotExist:
                return Response({"detail": "Informativo não encontrado."}, status=404)
            if i.estado in ("enviado", "cancelado"):
                if set(d) - {"observacao", "publico"}:
                    return Response({"detail": f"Informativo {i.get_estado_display().lower()}: só observação e publicação podem mudar."}, status=409)
            editado_a_mao = bool(i.texto and i.texto_gerado and i.texto != i.texto_gerado)
            if "emitido_em" in d and d["emitido_em"]:
                e = parse_datetime(d["emitido_em"])
                if e is not None:
                    i.emitido_em = timezone.make_aware(e) if timezone.is_naive(e) else e
            for campo in ("aproximacao_por", "aproximacao_intensidade", "observacao", "radar_fonte"):
                if campo in d:
                    setattr(i, campo, str(d[campo] or "")[:300])
            if "aproximacao_regioes" in d:
                i.aproximacao_regioes = [r for x in (d["aproximacao_regioes"] or []) for r in inf.normalizar_regiao(str(x))]
            if "radar_quadro_em" in d:
                q = parse_datetime(d["radar_quadro_em"]) if d["radar_quadro_em"] else None
                i.radar_quadro_em = (timezone.make_aware(q) if q is not None and timezone.is_naive(q) else q)
            if "publico" in d:
                i.publico = bool(d["publico"])
            if "texto_livre" in d:
                i.texto_livre = bool(d["texto_livre"])
            if "itens" in d:
                _grava_itens(i, d["itens"])
            if i.texto_livre:
                if "texto" in d:
                    i.texto = str(d["texto"])
            else:
                novo = _gerar_texto(i)
                if "texto" in d and d["texto"] != i.texto and not d.get("regenerar_texto"):
                    i.texto = str(d["texto"])
                elif d.get("regenerar_texto") or not editado_a_mao:
                    i.texto = novo
                i.texto_gerado = novo
            _registra(i, usuario, "editou", ", ".join(sorted(k for k in d if k != "texto") + (["texto"] if "texto" in d else [])))
            i.save()
        return Response(_serializa(i))


class InformativoEnviosView(APIView):
    """POST `<id>/envios/`: registra um reenvio do radar (`tipo=radar`, `detalhe`, `quadro_em`; pode repetir quantas vezes precisar) ou um canal da Idap
    (`tipo=idap`, `canal`, `autorizado_por`, `regioes`, `protocolo`). Só em informativo enviado. Regras de `core/informativo_envios.py`: erro bloqueia; aviso
    devolve 409 com a lista e só grava com `confirmar_avisos=true`. O painel não envia nada."""

    def post(self, request, pk):
        d = request.data or {}
        usuario = _usuario(request)
        with transaction.atomic():
            try:
                i = InformativoMeteorologico.objects.select_for_update().get(pk=pk)
            except InformativoMeteorologico.DoesNotExist:
                return Response({"detail": "Informativo não encontrado."}, status=404)
            if i.estado != "enviado":
                return Response({"detail": "Só informativo já registrado como enviado recebe reenvio de radar ou envio pela Idap."}, status=409)
            tipo = str(d.get("tipo") or "")
            if tipo not in ("radar", "idap"):
                return Response({"detail": "Tipo inválido (radar ou idap)."}, status=400)
            regioes = [r for x in (d.get("regioes") or []) for r in inf.normalizar_regiao(str(x))]
            quadro = parse_datetime(d["quadro_em"]) if d.get("quadro_em") else None
            if quadro is not None and timezone.is_naive(quadro):
                quadro = timezone.make_aware(quadro)
            if tipo == "radar":
                canal, detalhe, autorizado = "Radar", str(d.get("detalhe") or "").strip()[:160], ""
                if not detalhe:
                    return Response({"detail": "Informe qual radar foi enviado."}, status=400)
            else:
                canais = [str(c) for c in (d.get("canais") or ([d["canal"]] if d.get("canal") else []))]
                if not canais:
                    return Response({"detail": "Marque ao menos uma ferramenta da Idap."}, status=400)
                autorizado = str(d.get("autorizado_por") or "").strip()[:120]
                erros, avisos = [], []
                for c in canais:
                    er, av = envios_regras.avaliar_idap(c, _itens(i), autorizado, regioes)
                    erros += [x for x in er if x not in erros]
                    avisos += av
                if erros:
                    return Response({"detail": " ".join(erros), "erros": erros}, status=400)
                if avisos and not d.get("confirmar_avisos"):
                    return Response({"detail": "Confirme os avisos para registrar.", "avisos": avisos}, status=409)
                criados = []
                agora = timezone.now()
                for c in canais:  # a validação é o próprio preenchimento (`validado`, padrão sim): quem confirma que o disparo saiu na Idap
                    criados.append(InformativoEnvio.objects.create(
                        informativo=i, tipo="idap", canal=c, regioes=regioes, protocolo=str(d.get("protocolo") or "")[:80], autorizado_por=autorizado,
                        observacao=str(d.get("observacao") or "")[:300], enviado_por=usuario,
                        validado_em=agora if d.get("validado", True) else None, validado_por=usuario if d.get("validado", True) else "",
                    ))
                _registra(i, usuario, "envio Idap", ", ".join(canais))
                i.save(update_fields=["historico", "atualizado_em"])
                return Response({"envios": [_envio(x) for x in criados], "informativo": _serializa(i)}, status=201)
            e = InformativoEnvio.objects.create(
                informativo=i, tipo=tipo, canal=canal, detalhe=detalhe, quadro_em=quadro, regioes=regioes, protocolo="",
                autorizado_por="", observacao=str(d.get("observacao") or "")[:300], enviado_por=usuario,
            )
            _registra(i, usuario, "envio", f"{canal}{': ' + detalhe if detalhe else ''}")
            i.save(update_fields=["historico", "atualizado_em"])
        return Response({"envio": _envio(e), "informativo": _serializa(i)}, status=201)


class InformativoEnvioItemView(APIView):
    """POST `envios/<id>/validar/` (`validado` true/false: outra pessoa confirma que o disparo saiu na Idap) e DELETE `envios/<id>/` (lixeira: só administrador)."""

    def post(self, request, eid):
        d = request.data or {}
        try:
            e = InformativoEnvio.objects.select_related("informativo").get(pk=eid)
        except InformativoEnvio.DoesNotExist:
            return Response({"detail": "Envio não encontrado."}, status=404)
        if e.tipo != "idap":
            return Response({"detail": "Só envios da Idap são validados."}, status=400)
        usuario = _usuario(request)
        if d.get("validado", True):
            e.validado_em, e.validado_por = timezone.now(), usuario
        else:
            e.validado_em, e.validado_por = None, ""
        e.save(update_fields=["validado_em", "validado_por"])
        i = e.informativo
        _registra(i, usuario, "validou envio" if e.validado_em else "desfez validação", e.canal)
        i.save(update_fields=["historico", "atualizado_em"])
        return Response({"envio": _envio(e), "informativo": _serializa(i)})

    def delete(self, request, eid):
        if not request.user.is_superuser:
            return Response({"detail": "Só administrador apaga um envio registrado."}, status=403)
        try:
            e = InformativoEnvio.objects.select_related("informativo").get(pk=eid)
        except InformativoEnvio.DoesNotExist:
            return Response({"detail": "Envio não encontrado."}, status=404)
        i = e.informativo
        _registra(i, _usuario(request), "apagou envio", f"{e.canal} {e.detalhe}".strip())
        e.delete()
        i.save(update_fields=["historico", "atualizado_em"])
        return Response(_serializa(i))


class InformativoPreviaView(APIView):
    """POST: gera o texto sem salvar (a prévia ao vivo do compositor)."""

    def post(self, request):
        d = request.data or {}
        itens = []
        for b in d.get("itens") or []:
            for reg in inf.normalizar_regiao(str(b.get("regiao", ""))):
                itens.append({"regiao": reg, **{c: b.get(c) or (False if c in ("raios", "raios_atual", "granizo", "isolada") else "") for c in CAMPOS_REGIAO}})
        emitido = parse_datetime(d["emitido_em"]) if d.get("emitido_em") else None
        emitido = (timezone.localtime(timezone.make_aware(emitido) if timezone.is_naive(emitido) else emitido)) if emitido else _agora_local()
        prox = _proximo_numero()
        aprox = d.get("aproximacao") or None
        if aprox:
            aprox = {"regioes": [r for x in aprox.get("regioes", []) for r in inf.normalizar_regiao(str(x))], "intensidade": aprox.get("intensidade", ""), "por": aprox.get("por", "")}
        texto = inf.montar_texto(int(d.get("numero") or prox["numero"]), int(d.get("ano") or prox["ano"]), emitido, itens, aprox, ConfiguracaoInformativo.obter().rodape)
        g, raios = inf.maior_gravidade(itens)
        return Response({"texto": texto, "sms": inf.texto_sms(itens), "maior_gravidade": g, "caracteres": len(texto), "nm_sugerido": [{"regiao": x["regiao"], "nm": inf.nm_sugerido(x)[0], "so_a_pedido": inf.nm_sugerido(x)[1]} for x in itens if x["chuva_prevista"]]})


class InformativoAcaoView(APIView):
    """POST `<id>/<acao>/`: `revisar` (outra pessoa que não quem criou — recomendado, não obrigatório), `enviar` (registra o envio manual), `cancelar`
    (exige `motivo`; nunca apaga) e `sms` (marca por REDEC o SMS enviado via IDAP: `regioes` e `enviado` true/false)."""

    def post(self, request, pk, acao):
        usuario = _usuario(request)
        d = request.data or {}
        with transaction.atomic():
            try:
                i = InformativoMeteorologico.objects.select_for_update().get(pk=pk)
            except InformativoMeteorologico.DoesNotExist:
                return Response({"detail": "Informativo não encontrado."}, status=404)
            agora = timezone.now()
            if acao == "sms":
                regs = [r for x in (d.get("regioes") or []) for r in inf.normalizar_regiao(str(x))]
                enviado = bool(d.get("enviado", True))
                i.regioes.filter(regiao__in=regs).update(sms_enviado=enviado, sms_enviado_em=agora if enviado else None)
                _registra(i, usuario, "sms", f"{'enviado' if enviado else 'desmarcado'}: {', '.join(regs)}")
                i.save(update_fields=["historico", "atualizado_em"])
                return Response(_serializa(i))
            if acao not in ACOES:
                return Response({"detail": "Ação inválida."}, status=404)
            if i.estado == "cancelado":
                return Response({"detail": "Informativo cancelado não muda de estado."}, status=409)
            if acao == "revisar":
                if i.estado != "rascunho":
                    return Response({"detail": "Só rascunho pode ser revisado."}, status=409)
                i.estado, i.revisado_por, i.revisado_em = "revisado", usuario, agora
            elif acao == "enviar":
                if i.estado == "enviado":
                    return Response({"detail": "Informativo já registrado como enviado."}, status=409)
                if not i.regioes.exclude(chuva_atual="", chuva_prevista="").exists() and not i.texto_livre:
                    return Response({"detail": "Preencha ao menos uma região com chuva atual ou prevista antes de registrar o envio."}, status=400)
                i.estado, i.enviado_por, i.enviado_em = "enviado", usuario, agora
            else:
                motivo = str(d.get("motivo") or "").strip()
                if not motivo:
                    return Response({"detail": "Informe o motivo do cancelamento."}, status=400)
                i.estado, i.motivo_cancelamento = "cancelado", motivo[:300]
            _registra(i, usuario, acao, str(d.get("motivo") or ""))
            i.save()
        return Response(_serializa(i))


EPISODIO_LACUNA_H = 12
EPISODIO_MAX = 12


def _episodio(vigente: InformativoMeteorologico | None) -> list[InformativoMeteorologico]:
    """Informativos enviados anteriores do mesmo episódio de mau tempo: sequência para trás a partir do último enviado, enquanto o intervalo
    entre envios consecutivos não passar de 12 h (o vigente fica de fora, pois já tem seu card). Sem informativo recente, vazio."""
    recentes = list(InformativoMeteorologico.objects.filter(estado="enviado", enviado_em__isnull=False).prefetch_related("regioes").order_by("-enviado_em")[: EPISODIO_MAX + 1])
    if not recentes or timezone.now() - recentes[0].enviado_em > dt.timedelta(hours=EPISODIO_LACUNA_H + 6):
        return []
    cadeia = [recentes[0]]
    for x in recentes[1:]:
        if cadeia[-1].enviado_em - x.enviado_em > dt.timedelta(hours=EPISODIO_LACUNA_H):
            break
        cadeia.append(x)
    return [x for x in cadeia if not (vigente and x.pk == vigente.pk)][:EPISODIO_MAX]


class InformativoAcompanhamentoView(APIView):
    """O que a equipe precisa ver agora: informativo vigente, relógio do radar, lacunas na numeração, SMS pendentes, regiões sem informação."""

    def get(self, request):
        agora = timezone.now()
        ano = _agora_local().year
        cfg = ConfiguracaoInformativo.obter()
        enviados = list(InformativoMeteorologico.objects.filter(estado="enviado").order_by("-enviado_em")[:1])
        vigente = enviados[0] if enviados and _vigente_ate(enviados[0]) and _vigente_ate(enviados[0]) > agora else None
        numeros = list(InformativoMeteorologico.objects.filter(ano=ano).values_list("numero", flat=True))
        out = {"ano": ano, "proximo_numero": _proximo_numero(), "lacunas": inf.lacunas(numeros), "vigente": None, "emitir": None, "rascunhos": InformativoMeteorologico.objects.filter(estado__in=["rascunho", "revisado"]).count()}
        if vigente:
            itens = _itens(vigente)
            g, raios = inf.maior_gravidade(itens)
            hora = timezone.localtime(agora).hour
            intervalo, faixa = inf.intervalo_radar_min(g, raios, hora, cfg.cadencia_radar_min or None)
            ultimo_radar = vigente.envios.filter(tipo="radar").order_by("-enviado_em").first()
            proximo = ((ultimo_radar.enviado_em if ultimo_radar else None) or vigente.enviado_em or agora) + dt.timedelta(minutes=intervalo)
            out["vigente"] = {
                **_serializa(vigente, detalhe=True),
                "radar_intervalo_min": intervalo,
                "radar_faixa": faixa,
                "radar_proximo_em": proximo,
                "radar_atrasado": proximo < agora,
                "minutos_restantes": int((_vigente_ate(vigente) - agora).total_seconds() // 60),
                "sms_pendentes": [x["regiao"] for x in itens if inf.gravidade(x["chuva_prevista"]) >= 4 and not x["sms_enviado"]],
                "regioes_sem_informacao": [r for r in inf.REGIOES if r not in {x["regiao"] for x in itens}],
            }
        chuva = apoio.chuva_atual_cacheada()
        ref = {"numero": vigente.numero, "ano": vigente.ano, "vigente_ate": _vigente_ate(vigente), "itens": _itens(vigente)} if vigente else None
        out["emitir"] = {**apoio.quando_emitir(ref, chuva, agora), "renovar_em": _vigente_ate(vigente) if vigente else None}
        out["chuva_atual"] = {r: {k: v[k] for k in ("max_1h_mm", "rotulo", "classe", "estacao", "municipio")} for r, v in chuva.items()}
        inicio_dia = timezone.localtime(agora).replace(hour=0, minute=0, second=0, microsecond=0)
        out["episodio"] = [_serializa(x) for x in _episodio(vigente)]
        out["hoje"] = [_serializa(x, detalhe=False) for x in InformativoMeteorologico.objects.filter(emitido_em__gte=inicio_dia).exclude(estado="cancelado").order_by("-emitido_em").prefetch_related("regioes")]
        return Response(out)


class InformativoEstatisticasView(APIView):
    """Histórico em números (F25): por mês, por REDEC, SMS e intensidade prevista."""

    def get(self, request):
        ano = int(request.query_params.get("ano") or _agora_local().year)
        qs = InformativoMeteorologico.objects.filter(ano=ano).exclude(estado="cancelado").prefetch_related("regioes")
        por_mes: dict[int, int] = {}
        por_regiao: dict[str, dict] = {}
        for i in qs:
            if i.emitido_em:
                m = timezone.localtime(i.emitido_em).month
                por_mes[m] = por_mes.get(m, 0) + 1
            for r in i.regioes.all():
                if not (r.chuva_atual or r.chuva_prevista):
                    continue
                d = por_regiao.setdefault(r.regiao, {"informativos": 0, "sms": 0, "forte_ou_mais": 0})
                d["informativos"] += 1
                d["sms"] += int(r.sms_enviado)
                d["forte_ou_mais"] += int(inf.gravidade(r.chuva_prevista) >= 4)
        return Response({"ano": ano, "total": qs.count(), "por_mes": [{"mes": m, "total": por_mes.get(m, 0)} for m in range(1, 13)], "por_regiao": por_regiao})


class InformativoExportarView(APIView):
    """CSV no mesmo formato da planilha de controle (um linha por REDEC): número, ano, data, hora, REDEC, chuva, vento, SMS."""

    def get(self, request):
        ano = int(request.query_params.get("ano") or _agora_local().year)
        resp = HttpResponse(content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="informativos_{ano}.csv"'
        resp.write("﻿")
        w = csv.writer(resp, delimiter=";")
        w.writerow(["NÚMERO DO INFORMATIVO", "ANO DO INFORMATIVO", "DATA", "HORA", "REDEC", "CHUVA", "VENTO", "EMISSÃO DE SMS", "ESTADO"])
        for i in InformativoMeteorologico.objects.filter(ano=ano).prefetch_related("regioes").order_by("numero"):
            loc = timezone.localtime(i.emitido_em) if i.emitido_em else None
            for r in i.regioes.all():
                if not (r.chuva_atual or r.chuva_prevista):
                    continue
                w.writerow([i.numero, i.ano, f"{loc:%d/%m/%Y}" if loc else "", f"{loc:%H:%M}" if loc else "", r.regiao, inf.rotulo_intensidade(r.chuva_prevista or r.chuva_atual),
                            inf.RAJADAS.get(r.vento_previsto, ""), "SIM" if r.sms_enviado else "NÃO", i.get_estado_display()])
        return resp


class PublicoInformativoView(APIView):
    """Público (sem login, só leitura): o último informativo enviado marcado como público e ainda vigente."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        agora = timezone.now()
        i = InformativoMeteorologico.objects.filter(estado="enviado", publico=True).order_by("-enviado_em").first()
        ate = _vigente_ate(i) if i else None
        if not i or not ate or ate < agora:
            return Response({"informativo": None})
        return Response({"informativo": {"numero": i.numero, "ano": i.ano, "texto": _texto_ou_gerado(i), "enviado_em": i.enviado_em, "vigente_ate": ate}})
