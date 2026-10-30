# Growcend CRM — VPS par Deploy karne ki Guide (Step by Step)

Ye guide maan kar chalti hai ki aapke paas **Ubuntu 22.04 / 24.04 VPS** hai
(Hostinger, DigitalOcean, AWS Lightsail, Contabo — koi bhi chalega) aur ek **domain** (jaise `crm.growcend.com`).

---

## 0. Pehle ye cheezein ready rakhein

| Cheez | Kahan se |
|---|---|
| VPS ka IP, username (`root`), password | VPS provider ke dashboard se |
| Domain | GoDaddy / Hostinger / Namecheap |
| MongoDB Atlas account (free) | https://www.mongodb.com/atlas |
| Windows ho to **PuTTY** ya Windows Terminal, aur **WinSCP / FileZilla** | Free download |

---

## 1. MongoDB Atlas (Database) set karein

1. Atlas par login → **Create Cluster** → Free (M0) → Region: **Mumbai (ap-south-1)**.
2. **Database Access** → Add user → username/password banayein (password me `@ # %` jaise symbols avoid karein, warna URL me dikkat aati hai).
3. **Network Access** → Add IP → apne **VPS ka IP** daalein (`0.0.0.0/0` sirf testing ke liye).
4. **Connect → Drivers** → connection string copy karein. Usme `<password>` replace karein aur `/growcend_db` add karein:
   ```
   mongodb+srv://growcend_user:PASSWORD@cluster0.xxxxx.mongodb.net/growcend_db?retryWrites=true&w=majority
   ```

---

## 2. Domain ko VPS se jodein

Domain ke DNS settings me ek **A record** banayein:

| Type | Name | Value |
|---|---|---|
| A | `crm` | aapke VPS ka IP |

(10 min se 2 ghante tak lag sakte hain.)

---

## 3. VPS me login karein

```bash
ssh root@YOUR_VPS_IP
```

## 4. Zaroori software install karein (sirf pehli baar)

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx unzip
npm install -g pm2
node -v   # v20.x dikhna chahiye
```

Firewall:
```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

---

## 5. Code VPS par upload karein

**Tarika A (WinSCP/FileZilla):** `growcend-crm.zip` ko VPS ke `/var/www/` folder me upload karein. Phir:

```bash
cd /var/www
unzip growcend-crm.zip
cd growcend-crm
```

**Tarika B (GitHub — aage ke updates ke liye best):** code ko *private* GitHub repo me daalein, phir `git clone` karein.

---

## 6. `.env` file banayein

```bash
cd /var/www/growcend-crm
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # ye output JWT_SECRET me daalna hai
nano .env
```

`.env` me fill karein:
```
NODE_ENV=production
PORT=5000
MONGODB_URI=  (Step 1 wala string)
JWT_SECRET=   (upar generate kiya hua lamba string)
```
Save: `Ctrl+O` → Enter → `Ctrl+X`.

---

## 7. Install, Build, aur pehla Admin banayein

```bash
npm install
npm run build
npm run seed -- director YourStrongPass@123 "Director Name"
```

Last command se **Super Admin login** banta hai. Baaki sab employees ki login CRM ke andar **Employee Logins** tab se banegi.

---

## 8. PM2 se CRM ko 24x7 chalayein

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup     # jo command ye print kare, use copy karke run karein
pm2 logs growcend-crm   # "MongoDB Connected" dikhna chahiye. Bahar aane ke liye Ctrl+C
```

---

## 9. Nginx (domain se open karne ke liye)

```bash
cp deploy/nginx-growcend.conf /etc/nginx/sites-available/growcend
nano /etc/nginx/sites-available/growcend     # crm.yourdomain.com ko apne domain se replace karein
ln -s /etc/nginx/sites-available/growcend /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

## 10. Free SSL (https / taala 🔒)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d crm.yourdomain.com
```

Ab browser me kholein: **https://crm.yourdomain.com** ✅

---

## Code update kaise karein (baad me)

```bash
cd /var/www/growcend-crm
# nayi files upload karein (ya: git pull)
npm install
npm run build
pm2 restart growcend-crm
```

## Problem aaye to

| Problem | Kya check karein |
|---|---|
| Site nahi khul rahi | `pm2 status`, `pm2 logs growcend-crm`, `systemctl status nginx` |
| "MongoDB Connection Error" | Atlas me VPS IP allow hai? Password sahi hai? |
| 502 Bad Gateway | App band hai → `pm2 restart growcend-crm` |
| Login nahi ho raha | `npm run seed -- ...` dobara chalayein (password reset ho jayega) |

## Local computer par chalana (testing)

```bash
npm install
cp .env.example .env      # NODE_ENV=development kar dein
npm run dev:server        # terminal 1 — backend :5000
npm run dev               # terminal 2 — frontend http://localhost:5173
```
