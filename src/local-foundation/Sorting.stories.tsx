import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {SortHeader, type SortDirection} from './Sorting';

function SortExample() {
  const [sort, setSort] = useState<{key: string; direction: SortDirection}>({key: 'name', direction: 'asc'});
  const update = (key: string) => setSort((current) => current.key === key
    ? {...current, direction: current.direction === 'asc' ? 'desc' : 'asc'}
    : {key, direction: 'asc'});
  return <div className="operational-table" style={{minWidth: 520}}><div className="operational-table__head"><SortHeader columnKey="name" label="نام پرسنل" sort={sort} onSort={update}/><SortHeader columnKey="unit" label="واحد" sort={sort} onSort={update}/><SortHeader columnKey="date" label="تاریخ شروع" sort={sort} onSort={update}/></div></div>;
}

const meta = {
  title: 'Local Foundation/Sortable table header',
  component: SortHeader,
} satisfies Meta<typeof SortHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  args: {columnKey: 'name', label: 'نام پرسنل', sort: {key: 'name', direction: 'asc'}, onSort: () => undefined},
  render: () => <SortExample />,
};
