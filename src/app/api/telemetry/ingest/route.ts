import { NextRequest, NextResponse } from 'next/server';
import { IngestTelemetryPayloadSchema } from '@/domain/telemetry.schema';
import { processTelemetryIngest } from '@/server/telemetry/pipeline';

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = IngestTelemetryPayloadSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation Failed',
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const summary = await processTelemetryIngest(parsed.data);

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error: any) {
    console.error('API /telemetry/ingest error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
