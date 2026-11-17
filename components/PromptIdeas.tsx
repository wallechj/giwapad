"use client";

import { useState } from "react";
import { PROMPT_EXAMPLES, generateTokenIdeas, type TokenIdea } from "../lib/ideas";

export default function PromptIdeas({ onPick }: { onPick: (idea: TokenIdea) => void }) {
  const [prompt, setPrompt] = useState("");
  const [salt, setSalt] = useState(0);
  const [ideas, setIdeas] = useState<TokenIdea[]>([]);
  const [picked, setPicked] = useState<string | null>(null);

  const generate = (p: string, s: number) => {
    const list = generateTokenIdeas(p, s);
    setIdeas(list);
    setPicked(null);
  };

  return (
    <div className="prompt-box">
      <h3>✨ 一句话发币</h3>
      <p className="muted small">
        用一句话描述你的币，本地灵感生成器会给出名字、符号和介绍（不联网、不用 API key），
        选一个就能直接发币。
      </p>
      <div className="prompt-row">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="比如：一只会写代码的猫"
          maxLength={120}
          onKeyDown={(e) => { if (e.key === "Enter" && prompt.trim()) generate(prompt, 0); }}
        />
        <button className="btn primary" onClick={() => prompt.trim() && generate(prompt, 0)} disabled={!prompt.trim()}>
          生成点子
        </button>
      </div>
      <div className="examples">
        {PROMPT_EXAMPLES.map((ex) => (
          <button key={ex} className="chip" onClick={() => { setPrompt(ex); generate(ex, 0); }}>
            {ex}
          </button>
        ))}
      </div>

      {ideas.length > 0 && (
        <>
          <div className="idea-grid">
            {ideas.map((idea) => (
              <button
                key={idea.symbol}
                className={`idea-card ${picked === idea.symbol ? "picked" : ""}`}
                onClick={() => { setPicked(idea.symbol); onPick(idea); }}
              >
                <b>{idea.name}</b> <span className="muted">${idea.symbol}</span>
                <span className="idea-theme">{idea.theme}</span>
                <span className="muted small">{idea.description}</span>
                <span className="idea-cta">{picked === idea.symbol ? "✓ 已填入下方表单" : "用这个发币 →"}</span>
              </button>
            ))}
          </div>
          <button className="btn ghost" onClick={() => { const s = salt + 1; setSalt(s); generate(prompt, s); }}>
            🎲 换一批点子
          </button>
        </>
      )}
    </div>
  );
}
