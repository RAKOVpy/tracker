import { ChevronLeft } from 'lucide-react';
import { useGoBack } from './useGoBack';

export function BackButton({ fallback }: { fallback: string }) {
  const goBack = useGoBack(fallback);
  return (
    <button type="button" className="back-link" onClick={goBack}>
      <ChevronLeft size={16} aria-hidden /> Назад
    </button>
  );
}
