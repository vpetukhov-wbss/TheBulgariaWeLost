const youtubeId = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoId(input?: string): string | undefined {
  if (!input || !URL.canParse(input.trim())) return;
  const url = new URL(input.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    return;

  let id: string | undefined;
  if (url.hostname === 'youtu.be') {
    id = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
  } else if (
    ['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)
  ) {
    id =
      url.pathname === '/watch'
        ? (url.searchParams.get('v') ?? undefined)
        : /^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/.exec(
            url.pathname,
          )?.[1];
  }
  return id && youtubeId.test(id) ? id : undefined;
}
