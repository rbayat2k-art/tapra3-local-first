import type {Preview} from '@storybook/react-vite';
import '../src/index.css';

const preview: Preview = {
  decorators: [
    (Story) => (
      <div dir="rtl" style={{minWidth: 320, maxWidth: 760, padding: 24, fontFamily: 'Tahoma, Segoe UI, sans-serif'}}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    a11y: {
      test: 'error',
    },
    controls: {
      expanded: true,
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default preview;
