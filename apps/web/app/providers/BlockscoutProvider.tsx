'use client';

import { ReactNode } from 'react';
import {
  NotificationProvider,
  TransactionPopupProvider,
} from '@blockscout/app-sdk';

interface BlockscoutProviderProps {
  children: ReactNode;
}

export function BlockscoutProvider({ children }: BlockscoutProviderProps) {
  return (
    <NotificationProvider>
      <TransactionPopupProvider>{children}</TransactionPopupProvider>
    </NotificationProvider>
  );
}
