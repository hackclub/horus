import { Kbd } from "./ui/kbd";

export function KeybindGroup({ children }: { children: React.ReactNode }) {
  return <div className="px-2 flex flex-row gap-1">{children}</div>;
}

export function Keybind({ btn, name }: { btn: string; name?: string }) {
  return (
    <div className="text-sm text-muted-foreground text-mono">
      <Kbd className={name && "mr-1"}>{btn}</Kbd> {name}
    </div>
  );
}
