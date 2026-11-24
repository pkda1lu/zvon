import React from 'react';

interface Props {
    children: React.ReactNode;
    onClose: () => void;
}

export default class ChannelSettingsErrorBoundary extends React.Component<Props, { error: string | null }> {
    state: { error: string | null } = { error: null };

    static getDerivedStateFromError(error: Error) {
        return { error: error.message || 'Неизвестная ошибка' };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Не удалось открыть настройки канала', error, info.componentStack);
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div className="settings-card" role="alert">
                <h3>Не удалось открыть настройки канала</h3>
                <p>{this.state.error}</p>
                <button type="button" className="settings-btn secondary" onClick={this.props.onClose}>Закрыть</button>
            </div>
        );
    }
}
