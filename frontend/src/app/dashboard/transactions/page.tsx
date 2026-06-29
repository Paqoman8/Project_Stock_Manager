import { redirect } from 'next/navigation';

export default function TransactionsRedirectPage(): never {
  redirect('/dashboard/pos');
}
