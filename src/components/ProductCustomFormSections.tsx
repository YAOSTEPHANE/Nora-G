import type { ProductFormField, ProductFormSection } from '../db/types'
import { FormSection, FormSwitchRow } from '../ui/Form'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Switch } from '../ui/Switch'

type Values = Record<string, string | number | boolean | null>

type Props = {
  sections: ProductFormSection[]
  values: Values
  onChange: (key: string, value: string | number | boolean | null) => void
}

function spanClass(span?: 1 | 2 | 3): string | undefined {
  if (span === 2) return 'sm:col-span-2'
  if (span === 3) return 'sm:col-span-2 lg:col-span-3'
  return undefined
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: ProductFormField
  value: string | number | boolean | null
  onChange: (value: string | number | boolean | null) => void
}) {
  if (field.type === 'boolean') {
    return (
      <FormSwitchRow label={field.label}>
        <Switch
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      </FormSwitchRow>
    )
  }

  if (field.type === 'select') {
    return (
      <Field
        label={field.label}
        required={field.required}
        hint={field.hint}
        className={spanClass(field.span)}
      >
        <Select
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">—</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
      </Field>
    )
  }

  if (field.type === 'textarea') {
    return (
      <Field
        label={field.label}
        required={field.required}
        hint={field.hint}
        className={spanClass(field.span) ?? 'sm:col-span-2'}
      >
        <Textarea
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={field.placeholder}
        />
      </Field>
    )
  }

  return (
    <Field
      label={field.label}
      required={field.required}
      hint={field.hint}
      className={spanClass(field.span)}
    >
      <Input
        inputMode={field.type === 'number' ? 'decimal' : undefined}
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className={field.type === 'number' ? 'font-mono-nums' : undefined}
      />
    </Field>
  )
}

/** Rendu des sections dynamiques du formulaire article (par activité). */
export function ProductCustomFormSections({
  sections,
  values,
  onChange,
}: Props) {
  if (sections.length === 0) return null

  return (
    <>
      {sections.map((section) => (
        <FormSection
          key={section.id}
          title={section.title}
          description={section.description}
          columns={section.columns}
        >
          {section.fields.map((field) =>
            field.type === 'boolean' ? (
              <div
                key={field.id}
                className={spanClass(field.span) ?? 'sm:col-span-2'}
              >
                <FieldControl
                  field={field}
                  value={values[field.key] ?? false}
                  onChange={(v) => onChange(field.key, v)}
                />
              </div>
            ) : (
              <FieldControl
                key={field.id}
                field={field}
                value={values[field.key] ?? null}
                onChange={(v) => onChange(field.key, v)}
              />
            ),
          )}
        </FormSection>
      ))}
    </>
  )
}
