import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { taskTitle, durationMinutes } = await req.json();

    const stepCount = Math.max(3, Math.min(8, Math.ceil(durationMinutes / 15)));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "あなたはタスクを具体的な行動ステップに分解するアシスタントです。" +
            "各ステップは5〜15分で完了できる、すぐに取り掛かれる具体的なアクションにしてください。" +
            "抽象的な表現（「考える」「確認する」）ではなく、行動が明確な動詞で始めてください。",
        },
        {
          role: "user",
          content:
            `「${taskTitle}」（目安合計${durationMinutes}分）を、` +
            `5〜15分で完了できる具体的なアクションに${stepCount}ステップ程度で分解してください。\n\n` +
            `以下のJSON形式のみで返してください（余分な文字は不要）:\n` +
            `{"steps": [{"text": "具体的なアクション", "minutes": 10}]}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("No content from OpenAI");

    const data = JSON.parse(content);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Breakdown error:", error);
    return NextResponse.json(
      { error: "タスクの分解に失敗しました" },
      { status: 500 }
    );
  }
}
