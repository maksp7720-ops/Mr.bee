export const CONTACTS = {
  city: "Алматы",
  hours: "Ежедневно: с 10:00 до 20:00",
  phone: "+7 706 696-36-92",
  whatsappNumber: "77766252449",
  telegramUsername: "Mishkanchik228",
  instagramUsername: "maximka.puz",
  tiktokUsername: "pleezzz0"
};

function digitsOnly(s) {
  return (s || "").replace(/\D/g, "");
}

export function phoneHref() {
  const digits = digitsOnly(CONTACTS.phone);
  return digits ? `tel:+${digits}` : null;
}

export function whatsappUrl() {
  const digits = digitsOnly(CONTACTS.whatsappNumber);
  if (!digits) return null;
  const text = encodeURIComponent("Здравствуйте! Хочу узнать про мёд 🍯");
  return `https://wa.me/${digits}?text=${text}`;
}

export function telegramUrl() {
  if (CONTACTS.telegramUsername) return `https://t.me/${CONTACTS.telegramUsername.replace(/^@/, "")}`;
  const digits = digitsOnly(CONTACTS.phone);
  return digits ? `https://t.me/+${digits}` : null;
}

export function instagramUrl() {
  return CONTACTS.instagramUsername ? `https://instagram.com/${CONTACTS.instagramUsername.replace(/^@/, "")}` : null;
}

export function tiktokUrl() {
  return CONTACTS.tiktokUsername ? `https://www.tiktok.com/@${CONTACTS.tiktokUsername.replace(/^@/, "")}` : null;
}
