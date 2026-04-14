import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000';

function getBackendBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.API_BASE_URL ||
    DEFAULT_BACKEND_URL;
  return configured.replace(/\/$/, '');
}

function resolveTargetUrl(rawUrl: string) {
  const candidate = rawUrl.trim();
  if (!candidate) {
    throw new Error('Missing image URL');
  }

  if (candidate.startsWith('/')) {
    return `${getBackendBaseUrl()}${candidate}`;
  }

  return candidate;
}

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url');
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url query parameter' }, { status: 400 });
  }

  let targetUrl: string;
  try {
    targetUrl = resolveTargetUrl(rawUrl);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Invalid url parameter' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid target URL' }, { status: 400 });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Unsupported URL protocol' }, { status: 400 });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      cache: 'no-store',
      headers: {
        'User-Agent': 'PanelCraft-ImageProxy/1.0',
      },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream responded with ${upstream.status}` },
        { status: upstream.status }
      );
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.toLowerCase().includes('image')) {
      return NextResponse.json({ error: 'Upstream did not return an image' }, { status: 415 });
    }

    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=600',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch image' }, { status: 502 });
  }
}
