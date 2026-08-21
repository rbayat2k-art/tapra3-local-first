import type { Customer, User } from '../../types';
import { SaasCustomerWorkspace } from './SaasCustomerWorkspace';

interface CustomerSourceViewProps {
  customers: Customer[];
  users: User[];
  currentUser: User;
  onUpdateCustomers(customers: Customer[]): void;
}

export function CustomerSourceView(props: CustomerSourceViewProps) {
  void props;
  return <SaasCustomerWorkspace />;
}
