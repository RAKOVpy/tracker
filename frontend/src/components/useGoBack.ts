import { useLocation, useNavigate } from 'react-router-dom';

/** Назад по истории браузера; если страницу открыли по прямой ссылке — на `fallback`, а не прочь из приложения. */
export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return () => (location.key !== 'default' ? navigate(-1) : navigate(fallback));
}
