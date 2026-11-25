export const publicPageLoaders = {
    '/docs': () => import('../pages/Docs'),
    '/security': () => import('../pages/Security'),
    '/servers': () => import('../pages/Servers'),
    '/about': () => import('../pages/About'),
    '/download': () => import('../pages/Download'),
    '/policy': () => import('../pages/Policy'),
    '/vlyneid': () => import('../pages/VlyneIdLanding'),
};

export type PublicPagePath = keyof typeof publicPageLoaders;
