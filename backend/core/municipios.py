"""
Lista canônica de 92 municípios do Estado do Rio de Janeiro (IBGE).

Esta é a "fonte da verdade" para nomes de municípios em todo o painel (backend e frontend).
Todos os modelos e conectores devem usar esta lista para validação.

Sincronizado com frontend/src/lib/municipios-canonical.ts.
"""

import re

MUNICIPIOS_CANONICOS = [
    "Angra dos Reis",
    "Aperibé",
    "Araruama",
    "Areal",
    "Armação dos Búzios",
    "Arraial do Cabo",
    "Barra Mansa",
    "Barra do Piraí",
    "Belford Roxo",
    "Bom Jardim",
    "Bom Jesus do Itabapoana",
    "Cabo Frio",
    "Cachoeira de Macacu",
    "Cambuci",
    "Campos dos Goytacazes",
    "Cantagalo",
    "Carapebus",
    "Cardoso Moreira",
    "Carmo",
    "Casimiro de Abreu",
    "Comendador Levy Gasparian",
    "Conceição de Macabu",
    "Cordeiro",
    "Duas Barras",
    "Duque de Caxias",
    "Engenheiro Paulo de Frontin",
    "Guapimirim",
    "Iguaba Grande",
    "Itaboraí",
    "Itaguaí",
    "Italva",
    "Itaocara",
    "Itaperuna",
    "Itatiaia",
    "Japeri",
    "Laje de Muriaé",
    "Macaé",
    "Macuco",
    "Magé",
    "Mangaratiba",
    "Maricá",
    "Mendes",
    "Mesquita",
    "Miguel Pereira",
    "Miracema",
    "Natividade",
    "Nilópolis",
    "Niterói",
    "Nova Friburgo",
    "Nova Iguaçu",
    "Paracambi",
    "Paraty",
    "Paraíba do Sul",
    "Paty do Alferes",
    "Petrópolis",
    "Pinheiral",
    "Piraí",
    "Porciúncula",
    "Porto Real",
    "Quatis",
    "Queimados",
    "Quissamã",
    "Resende",
    "Rio Bonito",
    "Rio Claro",
    "Rio das Flores",
    "Rio das Ostras",
    "Rio de Janeiro",
    "Santa Maria Madalena",
    "Santo Antônio de Pádua",
    "Sapucaia",
    "Saquarema",
    "Seropédica",
    "Silva Jardim",
    "Sumidouro",
    "São Fidélis",
    "São Francisco de Itabapoana",
    "São Gonçalo",
    "São José de Ubá",
    "São José do Vale do Rio Preto",
    "São João da Barra",
    "São João de Meriti",
    "São Pedro da Aldeia",
    "São Sebastião do Alto",
    "Tanguá",
    "Teresópolis",
    "Trajano de Moraes",
    "Três Rios",
    "Valença",
    "Varre-Saí",
    "Vassouras",
    "Volta Redonda",
]

# Set para busca O(1)
MUNICIPIOS_SET = set(MUNICIPIOS_CANONICOS)


import unicodedata as _ud


def _chave(nome):
    """minúsculas, sem acento, hífen/pontuação -> espaço, espaços colapsados."""
    sem = _ud.normalize("NFKD", nome).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", " ", sem).strip()


_POR_CHAVE = {_chave(m): m for m in MUNICIPIOS_CANONICOS}
# Grafias alternativas vistas nas fontes -> canônico. "Capital" (região da
# REDEC 1) é sempre o município do Rio de Janeiro.
_ALIASES = {
    "capital": "Rio de Janeiro",
    "rio": "Rio de Janeiro",
    "municipio do rio de janeiro": "Rio de Janeiro",
    "armacao de buzios": "Armação dos Búzios",
    "buzios": "Armação dos Búzios",
    "parati": "Paraty",
    "trajano de morais": "Trajano de Moraes",
    "cachoeiras de macacu": "Cachoeira de Macacu",
    "laje do muriae": "Laje de Muriaé",
    "varre sai": "Varre-Saí",
    "sao jose do vale do rio preto": "São José do Vale do Rio Preto",
    "conceicao de macabu": "Conceição de Macabu",
    "comendador levy gasparian": "Comendador Levy Gasparian",
    "santo antonio de padua": "Santo Antônio de Pádua",
    "bom jesus de itabapoana": "Bom Jesus do Itabapoana",
    "sao joao do meriti": "São João de Meriti",
    "campos": "Campos dos Goytacazes",
    "campos dos goitacases": "Campos dos Goytacazes",
    "paraiba do sul": "Paraíba do Sul",
    "pico do couto": "Petrópolis",
}
_POR_CHAVE.update(_ALIASES)


def normalizar_para_canonico(nome):
    """Devolve o nome canônico (um dos 92) ou None se não mapear."""
    if not nome or not isinstance(nome, str):
        return None
    chave = _chave(nome)
    if not chave:
        return None
    achado = _POR_CHAVE.get(chave)
    if achado:
        return achado
    # "Rio de Janeiro - Bairro" / "Capital / Centro": tenta o trecho antes do separador
    for sep in (" - ", "-", " / ", " – ", ","):
        if sep in nome:
            achado = _POR_CHAVE.get(_chave(nome.split(sep)[0]))
            if achado:
                return achado
    return None


def canonico_ou_original(nome):
    """Canônico se mapear; senão o texto original (sem espaços sobrando)."""
    if not isinstance(nome, str):
        return nome
    return normalizar_para_canonico(nome) or nome.strip()


def is_municipio_valido(nome):
    """Verifica se um nome é um dos 92 canônicos do RJ."""
    if not nome or not isinstance(nome, str):
        return False
    return nome in MUNICIPIOS_SET


def assert_municipio_canonico(nome, contexto=""):
    """
    Retorna o nome canônico ou lança ValidationError.
    Útil para garantir que um valor seja sempre válido em models.

    Args:
        nome: str — nome a validar
        contexto: str — contexto para mensagem de erro (ex: "Station.municipality")

    Raises:
        ValueError: Se o nome não for um dos 92 canônicos

    Returns:
        str: Nome canônico
    """
    from django.core.exceptions import ValidationError

    canonico = normalizar_para_canonico(nome)
    if not canonico:
        raise ValidationError(
            f"Município inválido{f' ({contexto})' if contexto else ''}: '{nome}'. "
            f"Deve ser um dos 92 municípios do RJ."
        )
    return canonico


def get_choices_municipios():
    """
    Retorna lista de tuplas (valor, label) para uso em model ChoiceField.

    Returns:
        list: [(nome, nome), ...]  — pares iguais porque valor e exibição são o mesmo
    """
    return [(m, m) for m in MUNICIPIOS_CANONICOS]
