# Growcend CRM — Bilkul FREE me Online kaise karein (₹0)

**Kya use hoga:**

| Kaam | Free service | Limit |
|---|---|---|
| Code rakhna | GitHub (private repo) | Free |
| Database | MongoDB Atlas M0 | 512 MB — 1000 log ka data ~1–2 MB hi leta hai, lakhs records aa jayenge |
| Website chalana | Render.com Free Web Service | 15 min koi use na kare to so jata hai, pehli baar khulne me ~1 min lagta hai |
| Link | `growcend-crm.onrender.com` | Free (apna domain baad me jod sakte hain) |

Computer par kuch install karne ki zaroorat **nahi** hai — sab browser se hoga.

---

## Step 1 — ZIP extract karein
`growcend-crm.zip` par right-click → **Extract All**. Ek `growcend-crm` folder banega.

## Step 2 — GitHub par code daalein
1. https://github.com par free account banayein.
2. Upar **+ → New repository** → naam `growcend-crm` → **Private** select karein → **Create repository**.
3. Next page par **"uploading an existing file"** link par click karein.
4. `growcend-crm` folder ke **andar ki saari files aur folders** (src, deploy, server.js, package.json…) drag-drop karein.
   - `.gitignore` aur `.env.example` hidden dikh sakti hain — na jayein to koi baat nahi.
5. Neeche **Commit changes** dabayein.

## Step 3 — MongoDB Atlas (free database)
1. https://www.mongodb.com/atlas → **Try Free** → Google se signup.
2. **Create cluster** → **M0 Free** → Provider AWS → Region **Mumbai (ap-south-1)** → Create.
3. Username/password banayein (password me sirf letters + numbers rakhein, `@ # %` nahi). **Note kar lein.**
4. Left menu **Network Access → Add IP Address → "Allow access from anywhere" (0.0.0.0/0)** → Confirm.
   (Render free ka IP fixed nahi hota, isliye ye zaroori hai — isiliye password strong rakhein.)
5. **Database → Connect → Drivers** → connection string copy karein. Usme:
   - `<db_password>` ki jagah apna password
   - `.mongodb.net/` ke baad `growcend_db` likhein
   ```
   mongodb+srv://growcend:Pass1234xyz@cluster0.abcde.mongodb.net/growcend_db?retryWrites=true&w=majority
   ```

## Step 4 — Render par website live karein
1. https://render.com → **Get Started** → **GitHub se login** karein.
2. **New + → Web Service** → apna `growcend-crm` repo select karein (dikh na raha ho to "Configure GitHub" se access dein).
3. Settings bharein:

| Field | Value |
|---|---|
| Name | `growcend-crm` |
| Region | Singapore (India ke sabse paas) |
| Branch | `main` |
| Runtime | Node |
| Build Command | `npm install --include=dev && npm run build` |
| Start Command | `npm start` |
| Instance Type | **Free** |

4. **Environment Variables** me ye add karein:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Step 3 wala string |
| `JWT_SECRET` | koi bhi 40+ akshar ka random text (jaise keyboard par bina soche type karein: `kJ8s2LmQp9xV3nR7tY1wE5zA6bC4dF0gH2jK8mN`) |
| `ADMIN_USERNAME` | `director` |
| `ADMIN_PASSWORD` | apna strong password (min 8 akshar) |
| `ADMIN_NAME` | Director ka naam |

5. **Create Web Service** dabayein. 3–5 min me build hoga. Logs me dikhna chahiye:
   `✅ Growcend MongoDB Connected Successfully` aur `👑 Super Admin "director" created`
6. Upar link milega: `https://growcend-crm.onrender.com` → kholein → `director` + password se login ✅

## Step 5 — Staff ki login banayein
CRM me **Employee Logins** tab → har telecaller / counsellor ka naam, username, password, role daalein → **Create Login**.
Staff ko sirf link + unka username/password bhej dein.

---

## (Optional) Site ko sone se rokna — free
Render free 15 min baad so jata hai. Ise jagaye rakhne ke liye:
1. https://uptimerobot.com par free account.
2. **Add New Monitor** → HTTP(s) → URL: `https://growcend-crm.onrender.com/api/health` → Interval 5 minutes.
Isse office time me site turant khulegi. (Render free me mahine ke 750 ghante milte hain — ek service 24x7 ke liye kaafi hain.)

## Code me badlav kaise karein
GitHub repo me file kholein → ✏️ edit → **Commit**. Render apne-aap naya version deploy kar dega.

## Free ki seemayein (dhyan rahe)
- **Backup nahi milta** — hafte me ek baar Atlas me **Collections → Export** karke data download kar lein.
- Atlas me 60 din koi activity na ho to cluster pause ho sakta hai — roz use hoga to koi dikkat nahi.
- File/document upload (passport scan wagaira) free server par save nahi rehte — uske liye baad me Cloudinary (free) jodna padega.
- Jab staff 20+ ho jaye ya speed chahiye, Render Starter (~$7/mahina) par shift karein — code wahi rahega.

## Problem aaye to
| Problem | Hal |
|---|---|
| Build fail: `vite: not found` | Build Command me `--include=dev` likha hai na? check karein |
| `MongoDB Connection Error` | Atlas Network Access me 0.0.0.0/0 hai? Password me special symbol to nahi? |
| Login nahi ho raha | Render → Environment me ADMIN_USERNAME/PASSWORD sahi hai? Username chhote akshar me likhein |
| Site 1 min tak load hoti rahi | Normal hai (so rahi thi) — UptimeRobot laga dein |
