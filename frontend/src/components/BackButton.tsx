import { ChevronLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

/** «Назад» по истории браузера; если страницу открыли по прямой ссылке — на fallback. */
export function BackButton({ fallback }: { fallback: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <button type="button" className="back-link" onClick={() => (location.key !== 'default' ? navigate(-1) : navigate(fallback))}>
      <ChevronLeft size={16} aria-hidden /> Назад
    </button>
  );
}
