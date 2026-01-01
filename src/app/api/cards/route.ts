import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const cardsDirectory = path.join(process.cwd(), 'public/clash-royale-cards');
  
  try {
    const filenames = fs.readdirSync(cardsDirectory);
    // Filter for image files just in case
    const images = filenames.filter(file => /\.(png|jpg|jpeg|webp)$/i.test(file));
    
    return NextResponse.json(images);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read cards directory' }, { status: 500 });
  }
}
