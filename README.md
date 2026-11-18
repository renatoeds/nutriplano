# NutriPlano

Contador de calorias com ajuste automático da dieta, diário de alimentação e treino, medidas e fotos de progresso.
Site estático (HTML/JS) + Supabase (login, banco, fotos, função de IA).

## Estrutura
- `index.html`, `app.js`, `app.css`, `base.css`: o app
- `foods.js`: banco de alimentos (TACO/TBCA) e suplementos por marca
- `config.js`: URL e chave pública do Supabase (a segurança vem das regras RLS)

## Supabase (projeto `nutriplano`)
- Tabelas: `allowed_emails` (lista de acesso), `profiles`, `days` — todas com RLS
- Gatilho em `auth.users` bloqueia cadastro de e-mail fora da lista
- Bucket privado `progress` para fotos (pasta = id do usuário)
- Edge Function `ai`: usa o secret `OPENAI_API_KEY` (opcional `OPENAI_MODEL`, padrão `gpt-4o-mini`)

### Configuração no painel (Authentication → URL Configuration)
- **Site URL**: o endereço do Render (ex.: `https://nutriplano.onrender.com`)
- **Redirect URLs**: o mesmo endereço

## Deploy
Render → Static Site, sem build, publish directory `.`
