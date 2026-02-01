export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;

    if (!url || !url.includes('etuovi.com/kohde/')) {
      return res.status(400).json({ error: 'Invalid Etuovi URL' });
    }

    // Fetch the page HTML
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fi-FI,fi;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to fetch page' });
    }

    const html = await response.text();

    // Extract property images - look for the full path pattern with \u002F encoding
    // Pattern: d3ls91xgksobn.cloudfront.net\u002F{imageParameters}\u002Fetuovimedia\u002Fimages\u002Fproperty\u002Fimport\u002F...
    const imagePattern = /d3ls91xgksobn\.cloudfront\.net\\u002F\{imageParameters\}\\u002Fetuovimedia\\u002Fimages\\u002Fproperty\\u002Fimport\\u002F([^"]+?)\\u002FORIGINAL\.jpeg/g;
    const matches = [...html.matchAll(imagePattern)];

    // Extract unique image paths
    const imagePaths = new Set();
    for (const match of matches) {
      // Decode the \u002F to /
      const path = match[1].replace(/\\u002F/g, '/');
      imagePaths.add(path);
    }

    // Build full image URLs with high resolution parameters
    const images = Array.from(imagePaths).map(path =>
      `https://d3ls91xgksobn.cloudfront.net/1920x1920,fit,q90/etuovimedia/images/property/import/${path}/ORIGINAL.jpeg`
    );

    // Also try to extract directly linked images (non-encoded format)
    const directPattern = /d3ls91xgksobn\.cloudfront\.net\/[^"]+?\/etuovimedia\/images\/property\/import\/([^"]+?\/ORIGINAL\.jpeg)/g;
    const directMatches = [...html.matchAll(directPattern)];
    for (const match of directMatches) {
      const fullUrl = `https://d3ls91xgksobn.cloudfront.net/1920x1920,fit,q90/etuovimedia/images/property/import/${match[1]}`;
      if (!images.includes(fullUrl)) {
        images.push(fullUrl);
      }
    }

    // Extract property title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].split(' | ')[0] : 'Property';

    // Extract price - look for the main price display
    const priceMatch = html.match(/(\d{1,3}(?:\s?\d{3})*)\s*€/);
    const price = priceMatch ? priceMatch[1].replace(/\s/g, ' ') + ' €' : '';

    // Extract address from the page
    const addressMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const address = addressMatch ? addressMatch[1].trim() : '';

    // Extract size
    const sizeMatch = html.match(/(\d+(?:,\d+)?)\s*m²/);
    const size = sizeMatch ? sizeMatch[0] : '';

    return res.status(200).json({
      images,
      title,
      price,
      address,
      size,
      count: images.length
    });
  } catch (error) {
    console.error('Scrape error:', error);
    return res.status(500).json({ error: 'Failed to scrape page' });
  }
}
