import { useTranslation, Language } from "../lib/i18n";

export default function LanguageSwitcher() {
  const { language, setLanguage } = useTranslation();

  return (
    <select
      className="lang-select"
      value={language}
      onChange={(e) => setLanguage(e.target.value as Language)}
      aria-label="Select Language"
    >
      <option value="en">EN</option>
      <option value="vi">VI</option>
      <option value="it">IT</option>
      <option value="tr">TR</option>
    </select>
  );
}
