import {
  exampleHeading,
  examplePrompts,
  welcomeDescription,
  welcomeHint,
  welcomeTitle,
} from "../../shared/welcome";

export function Welcome() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-8">
      <h1 className="text-lg font-semibold text-cyan-600">{welcomeTitle}</h1>
      {welcomeDescription.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
        <p>{exampleHeading}</p>
        {examplePrompts.map((prompt, index) => (
          <p key={prompt}>{`${index + 1}. "${prompt}"`}</p>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted-foreground italic">{welcomeHint}</p>
    </div>
  );
}
