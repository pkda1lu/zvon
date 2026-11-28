import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Verification.css';

export default function VerificationBadge({ kind, id }: { kind: 'profile' | 'server'; id?: string }) {
    const [approvedKey, setApprovedKey] = useState('');
    const key = `${kind}/${id}`;
    useEffect(() => {
        if (!id) return;
        const controller = new AbortController();
        axios.get<{ verified: boolean }>(`/api/verification/badge/${kind}/${encodeURIComponent(id)}`, { signal: controller.signal })
            .then(({ data }) => { if (!controller.signal.aborted) setApprovedKey(data.verified ? key : ''); })
            .catch(() => { if (!controller.signal.aborted) setApprovedKey(''); });
        return () => controller.abort();
    }, [kind, id, key]);

    if (approvedKey !== key) return null;
    const label = kind === 'profile' ? 'Подтверждённый аккаунт' : 'Подтверждённое сообщество';
    return <span className={`verification-rosette verification-rosette-${kind}`} role="img" aria-label={label} title={label}>
        <span aria-hidden="true">✓</span>
    </span>;
}
