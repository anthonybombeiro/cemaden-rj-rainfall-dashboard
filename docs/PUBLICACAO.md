# Guia de Publicação - Dashboard Pluviométrico CEMADEN-RJ

## 🚀 Publicar no GitHub Pages (Recomendado)

### Opção 1: Usar GitHub Web (Mais Simples)

1. **Criar Repositório**
   - Acesse https://github.com/new
   - Repository name: `cemaden-rj-rainfall-dashboard`
   - Description: `Dashboard Interativo de Análise de Precipitação CEMADEN-RJ (2019-2026)`
   - Choose: **Public**
   - Clique em **Create repository**

2. **Fazer Upload dos Arquivos**
   - No novo repositório, clique em **Add file → Upload files**
   - Selecione todos os arquivos desta pasta
   - Escreva mensagem de commit: "Inicializar dashboard pluviométrico"
   - Clique em **Commit changes**

3. **Habilitar GitHub Pages**
   - Vá para **Settings → Pages**
   - Source: selecione **Deploy from a branch**
   - Branch: selecione **main**
   - Pasta: selecione **/ (root)**
   - Clique em **Save**

4. **Acessar o Dashboard**
   - Aguarde ~2 minutos
   - Seu dashboard estará em: `https://seuusername.github.io/cemaden-rj-rainfall-dashboard`

### Opção 2: Usar GitHub CLI (Mais Rápido)

Se você tem Git e GitHub CLI instalados:

```bash
# 1. Ir para o diretório do projeto
cd dashboard_final

# 2. Inicializar repositório local
git init
git add .
git commit -m "Inicializar dashboard pluviométrico CEMADEN-RJ"

# 3. Criar repositório no GitHub
gh repo create cemaden-rj-rainfall-dashboard --public --source=. --remote=origin --push

# 4. Habilitar GitHub Pages
gh repo edit --enable-wiki=false --enable-projects=false
```

### Opção 3: Usar Git na Linha de Comando

```bash
# 1. Inicializar repositório
cd dashboard_final
git init
git add .
git commit -m "Inicializar dashboard pluviométrico CEMADEN-RJ"

# 2. Adicionar origem remota
git remote add origin https://github.com/SEUUSERNAME/cemaden-rj-rainfall-dashboard.git
git branch -M main
git push -u origin main

# 3. Habilitar GitHub Pages (via Settings no GitHub.com)
```

## 📋 Configurar GitHub Pages via Web

Após fazer push do código:

1. Acesse seu repositório no GitHub
2. Vá para **Settings** (engrenagem no topo direito)
3. Na barra lateral, clique em **Pages**
4. Em "Source", selecione:
   - Branch: **main** (ou master)
   - Pasta: **/ (root)**
5. Clique em **Save**
6. Aguarde a mensagem: "Your site is live at https://..."

## 🔄 Atualizar Dados (Reprocessar)

Para atualizar os dados mensalmente:

1. Execute o script Python:
   ```bash
   python process_rainfall_advanced.py
   ```

2. Copie o novo `rainfall_data.json` para `data/rainfall.json`

3. Faça commit e push:
   ```bash
   git add data/rainfall.json
   git commit -m "Atualizar dados pluviométricos"
   git push
   ```

4. GitHub Pages fará deploy automaticamente!

## 🎨 Personalização

### Alterar Cores
Edite `index.html`, procure por `:root` e modifique as cores:

```css
:root {
    --primary: #013584;           /* Azul escuro */
    --primary-light: #00aeef;     /* Azul claro */
    --accent: #fd631f;            /* Laranja */
    
    --risk-very-low: #28A745;     /* Verde */
    --risk-low: #FFE510;          /* Amarelo */
    --risk-moderate: #FD7E14;     /* Laranja */
    --risk-high: #DC3545;         /* Vermelho */
    --risk-very-high: #6F42C1;    /* Roxo */
}
```

### Adicionar Informações do Município
Edite a seção "Sobre" em `index.html` com informações específicas.

### Modificar Limites de Risco
Na função `getColorForValue()`, ajuste os percentuais:

```javascript
if (percentage < 25) return 'var(--risk-very-low)';    // Muito baixo
if (percentage < 50) return 'var(--risk-low)';         // Baixo
if (percentage < 75) return 'var(--risk-moderate)';    // Moderado
if (percentage < 90) return 'var(--risk-high)';        // Alto
return 'var(--risk-very-high)';                        // Muito alto
```

## 🐛 Troubleshooting

### "Your site is ready to be published at..."
- Significa que Pages foi habilitado mas ainda não fez deploy
- Aguarde 2-5 minutos e recarregue a página

### Página fica em branco
- Verifique se `data/rainfall.json` existe
- Abra o console (F12) para ver mensagens de erro
- Confirme que o arquivo está no lugar correto

### Deploy falha no GitHub Actions
- Vá para **Actions** no repositório
- Clique no workflow que falhou
- Verifique o log de erro
- Mais comum: arquivo `rainfall.json` não existe

## 📊 Estrutura de Arquivos

```
repository/
├── index.html              # Dashboard principal
├── README.md               # Documentação
├── LICENSE                 # Licença CC-BY 4.0
├── .gitignore              # Arquivos ignorados
├── data/
│   ├── rainfall.json       # Dados em JSON
│   ├── resumo_geral.csv    # Resumo em CSV
│   └── top_eventos.csv     # Top eventos em CSV
├── docs/
│   ├── PUBLICACAO.md       # Este arquivo
│   └── ESTRUTURA_DADOS.md  # Documentação de dados
└── .github/
    └── workflows/
        └── deploy.yml      # Workflow GitHub Actions
```

## 🌐 Domínio Customizado (Opcional)

Para usar domínio customizado como `chuvas.cemaden.gov.br`:

1. Adicione um arquivo `CNAME` na raiz com:
   ```
   chuvas.cemaden.gov.br
   ```

2. Configure os registros DNS:
   - Adicione um registro `CNAME` apontando para `USERNAME.github.io`

3. Aguarde propagação de DNS (até 48 horas)

## 📝 Notas Importantes

- GitHub Pages oferece **ilimitado** de tráfego
- Não há limite de banda para repositórios públicos
- Deploy automático com GitHub Actions (incluso)
- Histórico completo do Git para rastreabilidade
- Fácil compartilhar com colaboradores

## 🔐 Segurança

- Credenciais sensíveis: **NUNCA** commitar
- Use variáveis de ambiente para dados sensíveis
- GitHub Pages é somente leitura (sem backend)
- Todos os cálculos acontecem no navegador do usuário

## 📞 Suporte

Para dúvidas sobre GitHub Pages:
- Documentação: https://docs.github.com/pages
- GitHub Community: https://github.community/
- Stack Overflow: tag `github-pages`

---

**Criado em**: Setembro 2026
**Compatibilidade**: GitHub Pages padrão (sem ação necessária)
