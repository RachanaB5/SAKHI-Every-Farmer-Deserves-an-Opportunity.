// Small form pieces shared by the join forms.
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SERVICE_AREAS, UNSERVED_AREAS } from "@/lib/areas";
import { LANGUAGES, type Option } from "@/lib/onboarding-options";

/** Label + control. */
export function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Text input wired to a setter. */
export function TextField({ label, id, value, onChange, hint, ...rest }: { label: string; id: string; value: string; onChange: (v: string) => void; hint?: string } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "id">) {
  return (
    <Field label={label} id={id} hint={hint}>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  );
}

/** Dropdown for a list of options. */
export function SelectField<V extends string>({ label, id, value, onChange, options, placeholder }: { label: string; id: string; value: string; onChange: (v: V) => void; options: readonly Option<V>[]; placeholder?: string }) {
  return (
    <Field label={label} id={id}>
      <Select value={value} onValueChange={(v) => onChange(v as V)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export const LanguageField = ({ value, onChange, label = "Preferred language" }: { value: string; onChange: (v: string) => void; label?: string }) => (
  <SelectField label={label} id="lang" value={value} onChange={onChange} options={LANGUAGES} />
);

/** Service-area dropdown; towns we don't serve yet are listed as "coming soon". */
export function AreaField({ value, onChange, label = "Your area", id = "area", servedOnly = false }: { value: string; onChange: (v: string) => void; label?: string; id?: string; servedOnly?: boolean }) {
  const options: Option[] = [
    ...SERVICE_AREAS.map((a) => ({ value: a.name, label: a.name })),
    ...(servedOnly ? [] : UNSERVED_AREAS.map((a) => ({ value: a, label: `${a} (coming soon)` }))),
  ];
  return <SelectField label={label} id={id} value={value} onChange={onChange} options={options} placeholder="Choose an area" />;
}

/** The 4–6 digit PIN input. */
export function PinField({ value, onChange, label = "Create a PIN", hint = "You'll use your mobile number and this PIN to sign in." }: { value: string; onChange: (v: string) => void; label?: string; hint?: string }) {
  return (
    <TextField label={label} id="pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} placeholder="4–6 digits" value={value} onChange={(v) => onChange(v.replace(/\D/g, ""))} hint={hint} />
  );
}
