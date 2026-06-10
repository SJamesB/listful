const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IMDBItem {
  imdb_id: string;
  title: string;
  year: string | null;
  media_type: 'Movie' | 'TV';
  poster_url: string | null;
  user_rating: number | null;
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function extractContent(xml: string, tag: string): string | null {
  // Matches <tag><![CDATA[...]]></tag> or <tag>...</tag>
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\\/${tag}>`,
  );
  const m = re.exec(xml);
  if (!m) return null;
  return (m[1] ?? m[2] ?? '').trim();
}

function parseRSS(xml: string): { items: IMDBItem[]; listName: string | null } {
  const titleMatch = /<channel>[\s\S]*?<title[^>]*>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/title>/.exec(xml);
  const listName = titleMatch ? titleMatch[1].trim() : null;

  const items: IMDBItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];

    const rawTitle = extractContent(block, 'title');
    if (!rawTitle) continue;

    const desc = extractContent(block, 'description') ?? '';

    // <link> in RSS 2.0 can be plain text between tags (not CDATA)
    const linkMatch = /<link>([\s\S]*?)<\/link>/.exec(block) ??
      /<guid[^>]*>([\s\S]*?)<\/guid>/.exec(block);
    const link = linkMatch ? linkMatch[1].trim() : null;

    // Require an IMDB ID — skip items we can't uniquely identify
    const idMatch = /\/title\/(tt\d+)/.exec(link ?? '');
    if (!idMatch) continue;
    const imdb_id = idMatch[1];

    // Title is "Movie Name (2024)" or "Show Name (2020–2023)" or "Show Name (2020– )"
    const titleYearRe = /^(.*?)\s*\((\d{4})[^)]*\)\s*$/.exec(rawTitle);
    const title = titleYearRe ? titleYearRe[1].trim() : rawTitle.replace(/\s*\(.*\)\s*$/, '').trim() || rawTitle;
    const year = titleYearRe ? titleYearRe[2] : null;

    // Detect TV series: year range in title, explicit labels, or description mentions
    const hasYearRange = /\(\d{4}[–\-–]/.test(rawTitle);
    const hasTVLabel = /\(TV\s+(?:Series|Mini.?Series|Short|Movie)\)/i.test(rawTitle);
    const descMentionsTV = /TV\s+Series|TV\s+Mini.?Series/i.test(desc);
    const media_type: 'Movie' | 'TV' = (hasYearRange || hasTVLabel || descMentionsTV) ? 'TV' : 'Movie';

    // Poster from description HTML <img src="...">
    const posterMatch = /<img[^>]+src="(https?:\/\/[^"]+)"/.exec(desc);
    const poster_url = posterMatch ? posterMatch[1] : null;

    // User rating from ratings list — "Your rating: 9/10" or similar
    const ratingMatch = /[Yy]our\s+rating:\s*(\d+)\/10/.exec(desc) ??
      /<b>User rating:<\/b>\s*(\d+)\/10/i.exec(desc);
    const user_rating = ratingMatch ? parseInt(ratingMatch[1], 10) : null;

    items.push({ imdb_id, title, year, media_type, poster_url, user_rating });
  }

  return { items, listName };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const body = await req.json();
    const { userId, source, listId } = body as {
      userId?: string;
      source?: 'watchlist' | 'ratings' | 'list';
      listId?: string;
    };

    let feedUrl: string;
    if (source === 'list' && listId) {
      feedUrl = `https://rss.imdb.com/list/${listId}`;
    } else if (source === 'ratings' && userId) {
      feedUrl = `https://rss.imdb.com/user/${userId}/ratings`;
    } else if (userId) {
      feedUrl = `https://rss.imdb.com/user/${userId}/watchlist`;
    } else {
      return respond({ error: 'userId is required' });
    }

    const res = await fetch(feedUrl, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    });

    if (res.status === 404) {
      return respond({
        error:
          "List not found. Check your IMDB user ID and make sure your Watchlist and Ratings are set to Public in IMDB Privacy Settings.",
      });
    }
    if (!res.ok) {
      return respond({ error: `IMDB returned HTTP ${res.status}` });
    }

    const xml = await res.text();
    const { items, listName } = parseRSS(xml);

    return respond({ items, listName, count: items.length });
  } catch (err) {
    return respond({ error: String(err) });
  }
});
