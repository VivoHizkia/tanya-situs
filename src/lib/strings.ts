// Text shown to a site's visitors in the chat window. It follows the language of the site
// the bot belongs to. The dashboard is English only.

const EN = {
  welcome: (name: string) => `Hi! Ask me anything about ${name}.`,
  placeholder: "Type your question…",
  send: "Send",
  thinking: "Checking our pages…",
  source: "Source",
  sources: "Sources",
  contact: "Contact us",
  leadIntro: "Want us to get back to you? Leave your name and an email or phone number.",
  leadName: "Name",
  leadContact: "Email or phone",
  leadSend: "Send",
  leadSending: "Sending…",
  leadSkip: "No thanks",
  leadDone: "Thanks! We will get back to you.",
  failed: "Something went wrong. Please try again.",
  poweredBy: "Answers come from this site's own pages.",
};

const ID: typeof EN = {
  welcome: (name: string) => `Halo! Silakan tanya apa saja tentang ${name}.`,
  placeholder: "Tulis pertanyaan Anda…",
  send: "Kirim",
  thinking: "Memeriksa halaman kami…",
  source: "Sumber",
  sources: "Sumber",
  contact: "Hubungi kami",
  leadIntro: "Mau kami hubungi? Tinggalkan nama dan email atau nomor telepon Anda.",
  leadName: "Nama",
  leadContact: "Email atau nomor telepon",
  leadSend: "Kirim",
  leadSending: "Mengirim…",
  leadSkip: "Tidak, terima kasih",
  leadDone: "Terima kasih! Kami akan menghubungi Anda.",
  failed: "Terjadi kesalahan. Silakan coba lagi.",
  poweredBy: "Jawaban diambil dari halaman situs ini.",
};

export type ChatStrings = Omit<typeof EN, "welcome">;

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "id", label: "Indonesian" },
] as const;

export function chatStrings(language: string): ChatStrings {
  const { welcome: _welcome, ...rest } = language === "id" ? ID : EN;
  return rest;
}

export const defaultWelcome = (language: string, name: string): string =>
  (language === "id" ? ID : EN).welcome(name);
