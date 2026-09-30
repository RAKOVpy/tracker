import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { showToast } from '../lib/toasts';

/** Кнопка «Загрузить пример»: пример создаётся обычными запросами, при сбое — сообщение и то, что успело создаться. */
export function useSeedDemo(load: () => Promise<void>) {
  const client = useQueryClient();
  const [seeding, setSeeding] = useState(false);

  async function seed() {
    setSeeding(true);
    try {
      await load();
    } catch (error) {
      showToast(`Пример загрузился не полностью. ${error instanceof Error ? error.message : ''}`.trim());
    } finally {
      await client.invalidateQueries();
      setSeeding(false);
    }
  }

  return { seeding, seed };
}
