// The Figma IDs remain valid for deep links to individual preview states.
export const screenPaths: Readonly<Record<string, string>> = {
  '19:1791': '/',
  '19:1884': '/archive',
  '19:1983': '/archive/vlakovete-na-bdzh',
  '19:2341': '/archive/rozober-kray-kazanlak',
  '19:2409': '/archive/pravets-82',
  '19:2182': '/episodes',
  '19:2290': '/about',
  '19:2478': '/login',
  '19:2533': '/register',
  '19:2594': '/forgot-password',
  '19:2785': '/account',
  '19:2853': '/account/materials',
  '19:2944': '/account/materials/new',
  '19:3043': '/account/saved',
  '21:342': '/mobile',
  '6:141': '/editor',
  '32:1383': '/editor/materials',
  '32:1493': '/editor/reports',
  '32:1592': '/editor/catalog',
  '32:1691': '/editor/media',
  '4:82': '/admin',
  '4:277': '/admin/materials',
  '4:556': '/admin/reports',
  '4:803': '/admin/catalog',
  '4:1038': '/admin/media',
  '4:1257': '/admin/users',
  '4:1495': '/admin/advertising',
  '4:1718': '/admin/settings',
  '4:1873': '/admin/storage',
  '4:2081': '/admin/audit',
  '4:2315': '/admin/operations',
};

export function screenPath(id: string): string {
  return screenPaths[id] ?? '/demo/' + id;
}
