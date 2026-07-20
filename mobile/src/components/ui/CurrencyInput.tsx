import { useCallback } from 'react';
import type { TextInputProps } from 'react-native';

import { TextField } from './TextField';

type Props = Omit<TextInputProps, 'keyboardType' | 'onChangeText' | 'value'> & {
  maxCents?: number;
  onChangeCents: (value: number) => void;
  symbol?: string;
  valueCents: number;
};

const DEFAULT_MAX_CENTS = 100_000_000;

export function CurrencyInput({
  maxCents = DEFAULT_MAX_CENTS,
  onChangeCents,
  symbol = '$',
  valueCents,
  ...props
}: Props) {
  const changeText = useCurrencyTextChange(onChangeCents, maxCents);

  return (
    <TextField
      keyboardType="number-pad"
      onChangeText={changeText}
      selectTextOnFocus
      value={formatCurrencyInput(valueCents, symbol)}
      {...props}
    />
  );
}

function useCurrencyTextChange(onChangeCents: (value: number) => void, maxCents: number) {
  return useCallback((text: string) => {
    onChangeCents(parseCurrencyInput(text, maxCents));
  }, [maxCents, onChangeCents]);
}

export function parseCurrencyInput(text: string, maxCents = DEFAULT_MAX_CENTS) {
  const digits = text.replace(/\D/g, '');
  if (!digits) return 0;
  const cents = Number.parseInt(digits, 10);
  return Number.isSafeInteger(cents) ? Math.min(cents, maxCents) : maxCents;
}

export function formatCurrencyInput(cents: number, symbol = '$') {
  const safeCents = Math.max(0, Math.trunc(cents));
  const dollars = String(Math.floor(safeCents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${symbol}${dollars}.${String(safeCents % 100).padStart(2, '0')}`;
}
