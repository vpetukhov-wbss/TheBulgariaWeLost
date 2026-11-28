import type { PublicMaterialDto } from './dto/material.dto';

export const archiveSiteName = 'България, която изгубихме';

const attributeEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => attributeEscapes[character]!);

export function materialShareHtml(
  material: PublicMaterialDto,
  frontendDomain: string,
): string {
  const episode = material.type === 'Episode';
  const title = escapeHtml(`${material.content.title} · ${archiveSiteName}`);
  const description = escapeHtml(
    (
      material.content.summary?.trim() ||
      material.content.subtitle?.trim() ||
      (episode
        ? 'Епизод от българския архив.'
        : 'Материал от българския архив.')
    ).slice(0, 160),
  );
  const canonical = escapeHtml(
    new URL(`/materials/${encodeURIComponent(material.slug)}`, frontendDomain)
      .href,
  );
  const image = escapeHtml(
    new URL('/assets/episode-share.png', frontendDomain).href,
  );
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<link rel="canonical" href="${canonical}">`,
    '<meta property="og:type" content="article">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${canonical}">`,
    ...(episode
      ? [
          `<meta property="og:image" content="${image}">`,
          '<meta property="og:image:width" content="1200">',
          '<meta property="og:image:height" content="630">',
          '<meta property="og:image:alt" content="България, която изгубихме · Дигитален архив">',
          '<meta name="twitter:card" content="summary_large_image">',
        ]
      : []),
  ].join('\n');
}
