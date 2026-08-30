"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addInstanceMember,
  deleteInstance,
  removeInstanceMember,
  type SettingsData,
  searchInstanceCandidates,
  transferInstance,
  updateIdentity,
  updateInstanceMemberRole,
  updateJellyMailbox,
  updateNephthys,
} from "@/app/actions/settings";
import ErrorFallback from "@/app/error-boundary";
import { Footer } from "@/components/footer";
import Navbar from "@/components/navbar";
import { PageWrapper } from "@/components/page-template";
import { LinkHref, PageDescription, PageHeader } from "@/components/text-types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const ORG_ROLES = ["helper", "admin", "sponsor"] as const;
const PROMOTABLE_ROLES = ["helper", "admin"] as const;
type OrgRole = (typeof ORG_ROLES)[number];

type SettingsSection = "Identity" | "Members" | "Nephthys" | "Jelly" | "Danger";

const SectionMeta: Record<
  SettingsSection,
  { description: string; destructive: boolean }
> = {
  Identity: {
    description: "Manage your instance identity across the platform.",
    destructive: false,
  },
  Members: {
    description: "Manage your instance members and their roles.",
    destructive: false,
  },
  Nephthys: {
    description:
      "Setup your nephthys instance and configure your slack channel.",
    destructive: false,
  },
  Jelly: {
    description: "Configure your Jelly mailbox through marmalade.",
    destructive: false,
  },
  Danger: {
    description:
      "Irreversible zone, manage your instance and delete it if you wish.",
    destructive: true,
  },
};

async function run(fn: () => Promise<unknown>, after: () => void) {
  try {
    await fn();
    after();
  } catch (e) {
    alert(e instanceof Error ? e.message : "Action failed");
  }
}

export function SettingsClient({ data }: { data: SettingsData }) {
  if (!data) {
    return (
      <>
        <Navbar />
        <PageWrapper variant="tight">
          <PageHeader title="Settings" breadcrumb="SETTINGS">
            <PageDescription>Manage your instance settings.</PageDescription>
          </PageHeader>
          <Card className="w-full border-2">
            <CardContent className="py-8 text-center text-muted-foreground">
              Go back to the <LinkHref href="/">homepage</LinkHref> and
              re-select an instance you are apart of.
            </CardContent>
          </Card>
        </PageWrapper>
        <Footer />
      </>
    );
  }
  return <SettingsInner data={data} />;
}

function SettingsInner({ data }: { data: NonNullable<SettingsData> }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const { perms } = data;

  // Only surface sections the caller can at least read.
  const visible: SettingsSection[] = [
    perms.identityRead && "Identity",
    perms.membersRead && "Members",
    perms.nephthysRead && "Nephthys",
    perms.sensitiveRead && "Jelly",
    perms.danger && "Danger",
  ].filter(Boolean) as SettingsSection[];

  const [activeSection, setActiveSection] = useState<SettingsSection>(
    visible[0] ?? "Identity",
  );

  function goTo(section: SettingsSection) {
    setActiveSection(section);
    document
      .getElementById(section.toLowerCase())
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <>
      <Navbar />
      <ErrorFallback title={"SETTINGS ERR"}>
        <PageWrapper variant="tight">
          <PageHeader title="Settings" breadcrumb="SETTINGS">
            <PageDescription>Manage your instance settings.</PageDescription>
          </PageHeader>
          <div className="grid grid-cols-4 gap-4 py-2">
            <div className="col-span-1">
              <div className="flex flex-col gap-1">
                {visible.map((key) => (
                  <button
                    type="button"
                    key={key}
                    className={cn(
                      "transition-all text-left text-md font-bold text-muted-foreground hover:text-foreground border-l-4 px-4 py-2",
                      activeSection === key
                        ? "border-primary text-foreground"
                        : "border-muted",
                    )}
                    onClick={() => goTo(key)}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-3">
              <div className="flex flex-col gap-6">
                {perms.identityRead && (
                  <Section name="Identity">
                    <IdentityForm
                      identity={data.identity}
                      canWrite={perms.identityWrite}
                      onSaved={refresh}
                    />
                  </Section>
                )}
                {perms.membersRead && (
                  <Section
                    name="Members"
                    component={
                      perms.membersWrite && (
                        <AddMemberDialog onAdded={refresh} />
                      )
                    }
                  >
                    <MembersPanel
                      members={data.members}
                      canWrite={perms.membersWrite}
                      onChanged={refresh}
                    />
                  </Section>
                )}
                {perms.nephthysRead && (
                  <Section name="Nephthys">
                    <NephthysForm
                      nephthys={data.nephthys}
                      canWrite={perms.nephthysWrite}
                      onSaved={refresh}
                    />
                  </Section>
                )}
                {perms.sensitiveRead && (
                  <Section name="Jelly">
                    <MarmaladeForm
                      marmalade={data.marmalade}
                      canWrite={perms.nephthysWrite}
                      onSaved={refresh}
                    />
                  </Section>
                )}
                {perms.danger && (
                  <Section name="Danger">
                    <DangerPanel members={data.members} onChanged={refresh} />
                  </Section>
                )}
              </div>
            </div>
          </div>
        </PageWrapper>
      </ErrorFallback>
      <Footer />
    </>
  );
}

// ==================== section shell ====================

function Section({
  name,
  children,
  component,
}: {
  name: SettingsSection;
  children: React.ReactNode;
  component?: React.ReactNode;
}) {
  const meta = SectionMeta[name];
  return (
    <Card
      id={name.toLowerCase()}
      className={cn(
        "w-full border-2",
        meta.destructive && "border-destructive",
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <h1 className="text-lg">{name}</h1>
          <p className="text-muted-foreground font-sans">{meta.description}</p>
        </div>
        {component}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function SettingLabel({ label, htmlFor }: { label: string; htmlFor: string }) {
  return (
    <Label
      htmlFor={htmlFor}
      className="text-sm font-bold text-muted-foreground pb-1"
    >
      {label}
    </Label>
  );
}

// ==================== Identity ====================

function IdentityForm({
  identity,
  canWrite,
  onSaved,
}: {
  identity: NonNullable<SettingsData>["identity"];
  canWrite: boolean;
  onSaved: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(
          () =>
            updateIdentity({
              name: String(f.get("name")),
              slug: String(f.get("slug")),
              logo: String(f.get("logo")),
            }),
          onSaved,
        );
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <SettingLabel htmlFor="display-name" label="Display Name" />
          <Input
            id="display-name"
            name="name"
            defaultValue={identity.name}
            disabled={!canWrite}
          />
        </div>
        <div>
          <SettingLabel htmlFor="instance-slug" label="Instance Slug" />
          <Input
            id="instance-slug"
            name="slug"
            defaultValue={identity.slug}
            disabled={!canWrite}
          />
        </div>
      </div>
      <div>
        <SettingLabel htmlFor="image-url" label="Image URL" />
        <Input
          id="image-url"
          name="logo"
          type="url"
          defaultValue={identity.logo ?? ""}
          disabled={!canWrite}
        />
      </div>
      <div className="bg-input/30 border">
        <div className="flex flex-row justify-between items-center p-4">
          <div className="flex flex-col">
            <p className="text-md font-bold">Instance Transparency</p>
            <p className="text-sm text-muted-foreground">
              Show your instance to the public or not. Doesn't do squat yet :)
            </p>
          </div>
          <Switch
            size="lg"
            defaultChecked={identity.transparent}
            disabled={!canWrite}
            onCheckedChange={(checked) =>
              run(() => updateIdentity({ transparent: checked }), onSaved)
            }
          />
        </div>
      </div>
      {canWrite && (
        <div>
          <Button type="submit">Save identity</Button>
        </div>
      )}
    </form>
  );
}

// ==================== Members ====================

function MembersPanel({
  members,
  canWrite,
  onChanged,
}: {
  members: NonNullable<SettingsData>["members"];
  canWrite: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slack</TableHead>
              <TableHead>Role</TableHead>
              {canWrite && (
                <TableHead className="text-right">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  No members yet.
                </TableCell>
              </TableRow>
            ) : (
              members.map((m) => (
                <TableRow key={m.memberId}>
                  <TableCell>{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.slack_id}
                  </TableCell>
                  <TableCell>
                    {canWrite ? (
                      <Select
                        value={m.role}
                        disabled={m.role === "sponsor"}
                        onValueChange={(v) =>
                          run(
                            () =>
                              updateInstanceMemberRole(
                                m.memberId,
                                v as OrgRole,
                              ),
                            onChanged,
                          )
                        }
                      >
                        <SelectTrigger size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PROMOTABLE_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{m.role}</Badge>
                    )}
                  </TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <ConfirmButton
                        trigger={
                          <Button size="sm" variant="destructive">
                            Remove
                          </Button>
                        }
                        title={`Remove ${m.name}?`}
                        description="They lose access to this instance."
                        onConfirm={() => removeInstanceMember(m.memberId)}
                        onDone={onChanged}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AddMemberDialog({ onAdded }: { onAdded: () => void }) {
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [role, setRole] = useState<OrgRole>("helper");
  const [open, setOpen] = useState(false);

  function AddMember() {
    setPicked(null);
    setRole("helper");
    setOpen(false);
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" className="self-start">
            Add member
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>User {picked && `→ ${picked.name}`}</Label>
            <CandidateSearch onSelect={setPicked} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORG_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={!picked}
            onClick={() =>
              picked && run(() => addInstanceMember(picked.id, role), AddMember)
            }
          >
            Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CandidateSearch({
  onSelect,
}: {
  onSelect: (u: { id: string; name: string }) => void;
}) {
  const [results, setResults] = useState<
    { id: string; name: string; slack_id: string }[]
  >([]);
  return (
    <div className="flex flex-col gap-1">
      <Input
        placeholder="Search users by name / email / slack id"
        onChange={async (e) => {
          const q = e.target.value;
          if (q.length < 2) return setResults([]);
          try {
            setResults(await searchInstanceCandidates(q));
          } catch {
            setResults([]);
          }
        }}
      />
      {results.length > 0 && (
        <div className="flex flex-col border border-input max-h-40 overflow-y-auto">
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              className="text-left px-2 py-1 text-sm hover:bg-accent"
              onClick={() => {
                onSelect(u);
                setResults([]);
              }}
            >
              {u.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Nephthys ====================

function NephthysForm({
  nephthys,
  canWrite,
  onSaved,
}: {
  nephthys: NonNullable<SettingsData>["nephthys"];
  canWrite: boolean;
  onSaved: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(
          () =>
            updateNephthys({
              host: String(f.get("host")),
              slackChannel: String(f.get("slackChannel")),
            }),
          onSaved,
        );
      }}
    >
      <div>
        <SettingLabel htmlFor="nephthys-slack-channel" label="Slack Channel" />
        <Input
          id="nephthys-slack-channel"
          name="slackChannel"
          placeholder="Enter slack channel ID"
          defaultValue={nephthys.slackChannel}
          disabled={!canWrite}
        />
      </div>
      <div>
        <SettingLabel htmlFor="nephthys-host-url" label="Nephthys Host URL" />
        <Field id="nephthys-host-url">
          <InputGroup>
            <InputGroupInput
              name="host"
              placeholder="example.com"
              defaultValue={nephthys.host}
              disabled={!canWrite}
            />
            <InputGroupAddon>
              <InputGroupText>https://</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </div>
      {canWrite && (
        <div>
          <Button type="submit">Save nephthys</Button>
        </div>
      )}
    </form>
  );
}

// ==================== Marmalade ====================

function MarmaladeForm({
  marmalade,
  canWrite,
  onSaved,
}: {
  marmalade: NonNullable<SettingsData>["marmalade"];
  canWrite: boolean;
  onSaved: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const mailboxId = String(new FormData(form).get("mailbox-id"));
        if (!mailboxId) return;
        run(
          () => updateJellyMailbox(mailboxId),
          () => {
            form.reset();
            onSaved();
          },
        );
      }}
    >
      <SettingLabel
        htmlFor="marmalade-mailbox-id"
        label="Marmalade Mailbox ID"
      />
      <Input
        id="marmalade-mailbox-id"
        name="mailbox-id"
        defaultValue={marmalade.mailboxId}
        placeholder={
          marmalade.mailboxId.length > 1
            ? marmalade.mailboxId
            : "Enter marmalade mailbox ID"
        }
        disabled={!canWrite}
      />
      <p className="text-xs mt-1 text-muted-foreground tracking-wide">
        You can fetch your mailbox ID on the{" "}
        <LinkHref href="https://marmalade.hackclub.dev/mailboxes">
          Marmalade Dashboard
        </LinkHref>
      </p>
      {canWrite && (
        <div className="mt-2 gap-2 flex flex-row">
          <Button type="submit">Save mailbox ID</Button>
          <Button type="button" variant="outline" onClick={() => {}}>
            Get my mailboxes
          </Button>
        </div>
      )}
    </form>
  );
}

// ==================== Danger ====================

function DangerPanel({
  members,
  onChanged,
}: {
  members: NonNullable<SettingsData>["members"];
  onChanged: () => void;
}) {
  return (
    <>
      <TransferDialog members={members} onDone={onChanged} />
      <DeleteInstanceRow onDone={onChanged} />
    </>
  );
}

function TransferDialog({
  members,
  onDone,
}: {
  members: NonNullable<SettingsData>["members"];
  onDone: () => void;
}) {
  const candidates = members.filter((m) => m.role !== "sponsor");
  const [target, setTarget] = useState("");
  return (
    <div className="bg-input/30 border">
      <div className="flex flex-row justify-between items-center p-4">
        <div className="flex flex-col">
          <p className="text-md font-bold">Transfer Instance</p>
          <p className="text-sm text-muted-foreground">
            Move the sponsor role to another member. You step down to admin.
          </p>
        </div>
        <Dialog>
          <DialogTrigger render={<Button variant="outline">Transfer</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transfer instance ownership</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <Label>New sponsor</Label>
              <Select value={target} onValueChange={(v) => setTarget(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a member" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name} ({m.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ConfirmButton
                trigger={
                  <Button variant="destructive" disabled={!target}>
                    Transfer ownership
                  </Button>
                }
                title="Transfer ownership?"
                description="They become sponsor and you drop to admin. This cannot be undone by you afterwards."
                onConfirm={() => transferInstance(target)}
                onDone={onDone}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function DeleteInstanceRow({ onDone }: { onDone: () => void }) {
  return (
    <div className="bg-input/30 border border-destructive">
      <div className="flex flex-row justify-between items-center p-4">
        <div className="flex flex-col">
          <p className="text-md font-bold text-destructive">Delete Instance</p>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the instance and all associated data.
          </p>
        </div>
        <ConfirmButton
          trigger={<Button variant="destructive">Delete</Button>}
          title="Delete this instance?"
          description="Permanently deletes the organization, instance, members, host and jelly config. Cannot be undone."
          onConfirm={() => deleteInstance()}
          onDone={onDone}
        />
      </div>
    </div>
  );
}

// ==================== shared ====================

function ConfirmButton({
  trigger,
  title,
  description,
  onConfirm,
  onDone,
}: {
  trigger: React.ReactElement;
  title: string;
  description: string;
  onConfirm: () => Promise<unknown>;
  onDone: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(onConfirm, onDone)}>
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
