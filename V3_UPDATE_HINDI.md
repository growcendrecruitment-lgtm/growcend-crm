# Growcend CRM — Version 3 (v3) kya naya hai

## 1. Data privacy (sabse zaroori)
- Telecaller / Counsellor: sirf apne daale hue ya apne ko assign hue candidates dikhte hain.
- Bittu (B2B): apne candidates (edit) + saare Telecallers aur Counsellors ke candidates (sirf VIEW).
- Documentation: sirf wo files jo unko di gayi hain ("Documentation Staff" mein unka naam).
- HR: apne candidates + documentation mein chal rahe candidates (sirf VIEW).
- Director: sab kuch.
- Ye rok server par lagi hai — direct link kholkar bhi koi doosre ka data nahi dekh sakta.
- Document delete ab sirf Director kar sakta hai.

## 2. Lead transfer
- Telecaller: Telecalling Station mein "Transfer to Counsellor" chuno, ya candidate page → Profile → "Assigned Counsellor".
- Counsellor (candidate select hone par): Profile → "Documentation Staff" chuno → Save. File Documentation ke paas chali jati hai.
- ZAROORI: purane candidates jo Documentation ke paas hain, unme ek baar "Documentation Staff" chun dein, warna Documentation ko nahi dikhenge.

## 3. B2B Agent Register (menu: B2B Agent Register)
- Telecaller agent / manpower company ki entry yahan karein (candidate list mein nahi).
- Har entry apne-aap Bittu ko jati hai, menu mein laal "new" dikhta hai.
- Bittu: status, rate, notes, communication history, Active/Inactive.
- Excel: "Entered by" mein telecaller chuno → Excel = us telecaller ki alag list.

## 4. Team Monitoring (Bittu + Director)
- Employee chuno → uska dashboard, follow-ups aur candidates (sirf dekhna).

## 5. Bill (menu: Bills & Payments)
- "Make New Bill" → candidate chuno → Receive Payment form → "Save Payment & Generate Bill".
- Ya candidate page → "Payments & Bills" tab.
- Bill button → "Print / Save as PDF" (PDF ka naam = bill number).
- Documentation staff bhi ab payment le kar bill bana sakta hai.
- Bill par: logo, Place of Supply state code ke saath, "Paid till this bill" aur sahi Balance.
- Company Settings mein Logo upload karein.

---
# v3.1 — Free mein speed + jagah
- Pages compress hokar aate hain (app 256 KB → 77 KB), doosri baar khulne par aur bhi tez.
- Nayi photo ~150 KB ki banti hai (pehle ~300 KB) → utni hi jagah mein double documents.
- Director Dashboard par "Free Storage Used" bar — 85% se upar laal ho to space badhane ka time.

## Site ko sone se rokna (FREE) — cron-job.org
1. https://cron-job.org par free account banao.
2. "Create cronjob" → URL: https://growcend-crm.onrender.com/api/health
3. Schedule: Every 10 minutes → Save.
Ab site 15 min baad nahi soyegi, 1 minute wait khatam.

## Documents ke liye double jagah (FREE) — doosra MongoDB
1. MongoDB Atlas → upar Project ka naam → "New Project" (naam: growcend-files) → Create.
2. Usme "Create" cluster → M0 FREE → AWS Mumbai → naam "Growcendfiles".
3. Database user banao (jaise "growcendfiles", strong password), Network Access: 0.0.0.0/0.
4. Connect → Drivers → connection string copy karo; <password> ki jagah password, aur ".net/" ke baad "growcend_files" likho.
5. Render → growcend-crm → Environment → Add: FILES_MONGODB_URI = wo string → Save (site restart hogi).
Note: purane documents purane database mein hi rahenge aur pehle ki tarah khulenge; naye documents doosre database mein jayenge.
