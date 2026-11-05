import { ArrowUpRightIcon, FileTextIcon, Globe2Icon, LanguagesIcon, TextCursorInputIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Welcome({
  onPrompt,
  onUpload,
  disabled,
}: {
  onPrompt: (prompt: string) => void;
  onUpload: () => void;
  disabled: boolean;
}) {
  return (
    <section className="welcome-panel" aria-labelledby="welcome-title">
      <div className="welcome-emblem" aria-hidden="true">
        <div className="welcome-orbit" />
        <div className="welcome-mark"><LanguagesIcon strokeWidth={1.4} /></div>
      </div>
      <p className="welcome-eyebrow">WORDS, WITHOUT BORDERS</p>
      <h1 id="welcome-title" className="welcome-title">好内容，<span>不止一种语言。</span></h1>
      <p className="welcome-description">从一段文字、一份文档或一个网页开始。<br className="sm:hidden" /> AI 逐段翻译，由你把握每一句。</p>
      <div className="welcome-actions" aria-label="开始翻译">
        <Button type="button" variant="outline" className="welcome-action" aria-label="翻译文字" disabled={disabled} onClick={() => onPrompt("请将下面的文字翻译成中文，保持原文的语气：\n")}>
          <span className="welcome-action-icon"><TextCursorInputIcon /></span>
          <span className="welcome-action-copy"><span>翻译文字</span><span>让表达自然、准确</span></span>
          <ArrowUpRightIcon data-icon="inline-end" className="welcome-action-arrow" />
        </Button>
        <Button type="button" variant="outline" className="welcome-action" aria-label="上传文档" disabled={disabled} onClick={onUpload}>
          <span className="welcome-action-icon"><FileTextIcon /></span>
          <span className="welcome-action-copy"><span>上传文档</span><span>保留结构，逐段打磨</span></span>
          <ArrowUpRightIcon data-icon="inline-end" className="welcome-action-arrow" />
        </Button>
        <Button type="button" variant="outline" className="welcome-action" aria-label="翻译网页" disabled={disabled} onClick={() => onPrompt("请将这个网页翻译成中文，保留标题和段落结构：\n")}>
          <span className="welcome-action-icon"><Globe2Icon /></span>
          <span className="welcome-action-copy"><span>翻译网页</span><span>一个链接，连接世界</span></span>
          <ArrowUpRightIcon data-icon="inline-end" className="welcome-action-arrow" />
        </Button>
      </div>
    </section>
  );
}
