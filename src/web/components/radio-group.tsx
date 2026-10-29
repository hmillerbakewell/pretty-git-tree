import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";

export interface RadioOption<Value extends string> {
  readonly value: Value;
  readonly content: ComponentChildren;
  readonly className?: string;
  readonly title?: string;
}

interface RadioGroupProps<Value extends string> {
  readonly options: readonly RadioOption<Value>[];
  readonly selected: Value;
  readonly onSelect: (value: Value) => void;
  readonly className: string;
  readonly labelledBy?: string;
  readonly label?: string;
}

const classNames = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

export function RadioGroup<Value extends string>({ options, selected, onSelect, className, labelledBy, label }: RadioGroupProps<Value>) {
  const name = useId();
  return (
    <fieldset class={className} aria-labelledby={labelledBy} aria-label={label}>
      {options.map((option) => (
        <label key={option.value} class={classNames(option.className, option.value === selected && "on")} title={option.title}>
          <input
            type="radio"
            class="visually-hidden"
            name={name}
            value={option.value}
            checked={option.value === selected}
            onChange={() => onSelect(option.value)}
          />
          {option.content}
        </label>
      ))}
    </fieldset>
  );
}
