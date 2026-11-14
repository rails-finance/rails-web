// A lane's words with "Sieve" linked to its repository, wherever the status
// page names what reads a protocol or a price (rails-ops ui-jobs 583).

export const SIEVE_URL = "https://github.com/slvDev/sieve";

export function SieveLink() {
  return (
    <a href={SIEVE_URL} target="_blank" rel="noopener" className="link-external">
      Sieve
    </a>
  );
}

export function LaneText({ text }: { text: string }) {
  if (!text.startsWith("Sieve")) return <>{text}</>;
  return (
    <>
      <SieveLink />
      {text.slice(5)}
    </>
  );
}
