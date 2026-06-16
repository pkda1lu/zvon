import React from 'react';
import SettingsLayout from '../pages/settings/SettingsLayout';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: string;
}

const SettingsModal: React.FC<SettingsModalProps> = (props) => {
  return <SettingsLayout {...props} />;
};

export default SettingsModal;
