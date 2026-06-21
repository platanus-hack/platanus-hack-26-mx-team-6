# Minecraft Companion 🍌

<img src="./project-logo.png" alt="Project Logo" width="200" />

**Track:** 👁️ New Interfaces
**Team:** team-6 (CDMX)

---

## Tu aliado inteligente en Minecraft 

Un 🍌 companion 🍌 IA 🍌 que 🍌 revoluciona 🍌 cómo 🍌 juegas 🍌. Habla 🍌, escucha 🍌 , actúa 🍌 contigo 🍌 en 🍌 tiempo 🍌 real 🍌. Nunca 🍌 más 🍌 solo 🍌.

## Cómo funciona

1. Hablas al micrófono
2. Tu companion entiende lo que necesitas
3. Actúa contigo en el juego
4. Conversan mientras juegas

## Comandos principales

| Dices                   | Tu companion              |
| ----------------------- | ------------------------- |
| "Ven aquí"             | Camina hacia ti           |
| "Sígueme"              | Te acompaña              |
| "Salta"                 | Salta contigo             |
| "Dame 10 diamantes"     | Te entrega items          |
| "Construyamos una base" | Colabora en tu estrategia |

## Empieza

```bash
# 1. Bot (Node.js)
cd bot && npm install

# 2. Cliente de voz (Python)
cd voice && pip install -r requirements.txt

# 3. Arranca ambos
node bot/index.js &
python voice/voice_client.py
```

Lee más en `VOICE.md`.

---

## Equipo

- Ubaldi Mancilla ([@ubaldimancilla-lgtm](https://github.com/ubaldimancilla-lgtm))
- Alejandro Mancilla López ([@alexmancilla](https://github.com/alexmancilla))
- Aaron Yeshua Gracia Lopez ([@AstroYeshu](https://github.com/AstroYeshu))

## ⚠️ Deploying & integrations (Vercel, Render, etc.)

Deploy platforms like **Vercel**, **Render** or **Netlify** can only connect to
repositories **you own** — they can't be granted access to this organization repo.
To deploy (or add any integration) while keeping your commits here, mirror your
code to a personal repo:

1. Create a **personal** repository on your own GitHub account.
2. Point your local `origin` at **both** repos, so a single `git push` updates each one:

   ```bash
   # this org repo (keep it as a push target)...
   git remote set-url --add --push origin https://github.com/platanus-hack/platanus-hack-26-mx-team-6.git
   # ...and your personal repo
   git remote set-url --add --push origin https://github.com/<your-user>/<your-repo>.git
   ```

   From now on `git push` sends every commit to **both** repositories.
3. Connect your deploy service (Vercel, Render, …) to your **personal** repo and deploy from there.

Your commits stay mirrored here for judging, while the deploy runs from the repo you control.

Have fun! 🚀
