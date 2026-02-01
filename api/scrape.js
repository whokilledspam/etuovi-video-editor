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

    // Extract images with their room tags
    const imagePattern = /d3ls91xgksobn\.cloudfront\.net\\u002F\{imageParameters\}\\u002Fetuovimedia\\u002Fimages\\u002Fproperty\\u002Fimport\\u002F([^"]+?)\\u002FORIGINAL\.jpeg/g;
    const matches = [...html.matchAll(imagePattern)];

    const imagePaths = new Set();
    for (const match of matches) {
      const path = match[1].replace(/\\u002F/g, '/');
      imagePaths.add(path);
    }

    const images = Array.from(imagePaths).map(path =>
      `https://d3ls91xgksobn.cloudfront.net/1920x1920,fit,q90/etuovimedia/images/property/import/${path}/ORIGINAL.jpeg`
    );

    // Extract image tags/rooms from the data
    const imageTagPattern = /"imageTag":"([^"]+)"/g;
    const tagMatches = [...html.matchAll(imageTagPattern)];
    const imageTags = tagMatches.map(m => m[1]);

    // Extract room descriptions
    const roomDescriptions = {};
    
    // Kitchen
    const kitchenMatch = html.match(/"kitchenDescription":"([^"]+)"/);
    if (kitchenMatch) {
      roomDescriptions.kitchen = cleanDescription(kitchenMatch[1]);
    }
    
    // Living room
    const livingRoomMatch = html.match(/"livingRoomDescription":"([^"]+)"/);
    if (livingRoomMatch) {
      roomDescriptions.livingRoom = cleanDescription(livingRoomMatch[1]);
    }
    
    // Bedroom
    const bedroomMatch = html.match(/"bedroomDescription":"([^"]+)"/);
    if (bedroomMatch) {
      roomDescriptions.bedroom = cleanDescription(bedroomMatch[1]);
    }
    
    // Sauna
    const saunaMatch = html.match(/"saunaDescription":"([^"]+)"/);
    if (saunaMatch) {
      roomDescriptions.sauna = cleanDescription(saunaMatch[1]);
    }
    
    // Bathroom/WC
    const toiletMatch = html.match(/"toiletDescription":"([^"]+)"/);
    if (toiletMatch) {
      roomDescriptions.bathroom = cleanDescription(toiletMatch[1]);
    }
    
    // Other spaces
    const otherSpaceMatch = html.match(/"otherSpaceDescription":"([^"]+)"/);
    if (otherSpaceMatch) {
      roomDescriptions.other = cleanDescription(otherSpaceMatch[1]);
    }

    // Extract main description
    const mainDescMatch = html.match(/<p[^>]*class="[^"]*HOsH9IY[^"]*"[^>]*>([^<]+)</);
    let mainDescription = '';
    if (mainDescMatch) {
      mainDescription = mainDescMatch[1];
    } else {
      // Try to extract from JSON
      const descJsonMatch = html.match(/"description":"([^"]{100,})"/);
      if (descJsonMatch) {
        mainDescription = cleanDescription(descJsonMatch[1]);
      }
    }

    // Extract property title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].split(' | ')[0] : 'Property';

    // Extract price
    const priceMatch = html.match(/(\d{1,3}(?:\s?\d{3})*)\s*€/);
    const price = priceMatch ? priceMatch[1].replace(/\s/g, ' ') + ' €' : '';

    // Extract address
    const addressMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const address = addressMatch ? addressMatch[1].trim() : '';

    // Extract size
    const sizeMatch = html.match(/(\d+(?:,\d+)?)\s*m²/);
    const size = sizeMatch ? sizeMatch[0] : '';

    // Extract year
    const yearMatch = html.match(/"constructionFinishedYear":(\d{4})/);
    const year = yearMatch ? yearMatch[1] : '';

    // Extract room count
    const roomCountMatch = html.match(/"bedroomCount":(\d+)/);
    const bedroomCount = roomCountMatch ? parseInt(roomCountMatch[1]) : 0;

    // Extract condition
    const conditionMatch = html.match(/"overallCondition":"([^"]+)"/);
    const condition = conditionMatch ? conditionMatch[1] : '';

    // Generate punchy one-liners for rooms
    const roomCaptions = generateRoomCaptions(roomDescriptions, {
      price, size, year, bedroomCount, condition, address
    });

    return res.status(200).json({
      images,
      imageTags,
      title,
      price,
      address,
      size,
      year,
      bedroomCount,
      condition,
      mainDescription,
      roomDescriptions,
      roomCaptions,
      count: images.length
    });
  } catch (error) {
    console.error('Scrape error:', error);
    return res.status(500).json({ error: 'Failed to scrape page' });
  }
}

function cleanDescription(text) {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\u002F/g, '/')
    .replace(/\\"/g, '"')
    .trim();
}

function generateRoomCaptions(roomDescriptions, propertyInfo) {
  const captions = {};
  
  // Kitchen caption
  if (roomDescriptions.kitchen) {
    const desc = roomDescriptions.kitchen.toLowerCase();
    if (desc.includes('remontoitu') || desc.includes('uusittu')) {
      captions.kitchen = 'Uudistettu keittiö ✨';
    } else if (desc.includes('tilava') || desc.includes('iso')) {
      captions.kitchen = 'Tilava keittiö ruokailuun 🍽️';
    } else if (desc.includes('perinteinen')) {
      captions.kitchen = 'Tunnelmallinen keittiö 🏠';
    } else {
      captions.kitchen = 'Kodin sydän 💛';
    }
  }
  
  // Living room caption
  if (roomDescriptions.livingRoom) {
    const desc = roomDescriptions.livingRoom.toLowerCase();
    if (desc.includes('takka')) {
      captions.livingRoom = 'Takkahuone tunnelmaan 🔥';
    } else if (desc.includes('tilava') || desc.includes('avara')) {
      captions.livingRoom = 'Avara olohuone 🛋️';
    } else if (desc.includes('valoisa')) {
      captions.livingRoom = 'Valoisa olohuone ☀️';
    } else {
      captions.livingRoom = 'Viihtyisä olohuone 🏡';
    }
  }
  
  // Bedroom caption
  if (roomDescriptions.bedroom) {
    const desc = roomDescriptions.bedroom.toLowerCase();
    if (desc.includes('säilytystila') || desc.includes('kaapisto')) {
      captions.bedroom = 'Makuuhuone + runsas säilytystila 👔';
    } else if (desc.includes('tilava') || desc.includes('iso')) {
      captions.bedroom = 'Tilava makuuhuone 🛏️';
    } else {
      captions.bedroom = 'Rauhallinen makuuhuone 😴';
    }
  }
  
  // Sauna caption
  if (roomDescriptions.sauna) {
    const desc = roomDescriptions.sauna.toLowerCase();
    if (desc.includes('puukiuas')) {
      captions.sauna = 'Aito puusauna 🧖';
    } else {
      captions.sauna = 'Oma sauna rentoutumiseen 🧖‍♂️';
    }
  }
  
  // Bathroom caption
  if (roomDescriptions.bathroom) {
    const desc = roomDescriptions.bathroom.toLowerCase();
    if (desc.includes('remontoitu') || desc.includes('uusittu')) {
      captions.bathroom = 'Uudistettu kylpyhuone 🚿';
    } else {
      captions.bathroom = 'Toimiva kylpyhuone 🛁';
    }
  }
  
  // Exterior/yard caption
  captions.exterior = 'Tervetuloa kotiin! 🏠';
  
  // Property highlights
  if (propertyInfo.year && parseInt(propertyInfo.year) < 1960) {
    captions.intro = `Historiallinen ${propertyInfo.year}-luvun helmi ✨`;
  } else if (propertyInfo.year && parseInt(propertyInfo.year) > 2010) {
    captions.intro = 'Moderni ja energiatehokas 🌱';
  }
  
  // Price highlight
  if (propertyInfo.price) {
    captions.price = `${propertyInfo.price}`;
  }
  
  // Size highlight
  if (propertyInfo.size) {
    captions.size = `${propertyInfo.size} tilaa elämälle`;
  }
  
  return captions;
}
