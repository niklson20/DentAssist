"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { signInWithDevicePassword, signInWithPin } from "@/app/actions/pin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { PIN_LOCK_ERROR, pinEntryExpired, type ReceptionMember } from "@/lib/reception-pin-ui";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function ReceptionDesk({
  clinicName,
  members,
}: {
  clinicName: string;
  members: ReceptionMember[];
}) {
  const [member, setMember] = useState<ReceptionMember | null>(null);

  if (!member) {
    return (
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xs">
        <h1 className="text-xl font-semibold break-words">{clinicName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Izaberite svoje ime.</p>
        {members.length === 0 ? (
          <p className="mt-6 text-sm">Niko od osoblja nema podešen PIN.</p>
        ) : (
          <div className="mt-6 flex flex-col gap-2">
            {members.map((person) => (
              <Button
                key={person.id}
                type="button"
                variant="outline"
                className="h-12 w-full justify-start text-base"
                onClick={() => setMember(person)}
              >
                {person.firstName} {person.lastName}
              </Button>
            ))}
          </div>
        )}
      </section>
    );
  }

  return <MemberSignIn key={member.id} member={member} onLeave={() => setMember(null)} />;
}

function MemberSignIn({ member, onLeave }: { member: ReceptionMember; onLeave: () => void }) {
  const [phase, setPhase] = useState<"pin" | "password">("pin");
  const [pinResult, pinAction, pinPending] = useActionState<ActionResult | null, FormData>(signInWithPin, null);
  const [passwordResult, passwordAction, passwordPending] = useActionState<ActionResult | null, FormData>(
    signInWithDevicePassword,
    null,
  );
  const [pin, setPin] = useState("");
  const [seenPinResult, setSeenPinResult] = useState(pinResult);
  const rootRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submittedPin = useRef("");
  const lastTouch = useRef(0);

  if (pinResult !== seenPinResult) {
    setSeenPinResult(pinResult);
    if (pinResult && !pinResult.ok) {
      setPin("");
      if (pinResult.error === PIN_LOCK_ERROR) {
        setPhase("password");
      }
    }
  }

  useEffect(() => {
    if (phase !== "pin") {
      return;
    }
    lastTouch.current = Date.now();
    const mark = () => {
      lastTouch.current = Date.now();
    };
    const tick = window.setInterval(() => {
      if (pinEntryExpired(lastTouch.current, Date.now())) {
        onLeave();
      }
    }, 1000);
    const node = rootRef.current;
    node?.addEventListener("pointerdown", mark);
    node?.addEventListener("keydown", mark);
    return () => {
      window.clearInterval(tick);
      node?.removeEventListener("pointerdown", mark);
      node?.removeEventListener("keydown", mark);
    };
  }, [phase, onLeave]);

  useEffect(() => {
    if (pin.length !== 6) {
      submittedPin.current = "";
      return;
    }
    if (phase !== "pin" || pinPending || submittedPin.current === pin) {
      return;
    }
    submittedPin.current = pin;
    formRef.current?.requestSubmit();
  }, [phase, pin, pinPending]);

  function appendPin(digit: string) {
    setPin((current) => (current.length >= 6 ? current : current + digit));
  }

  const pinError = pinResult && !pinResult.ok && pinResult.error !== PIN_LOCK_ERROR ? pinResult.error : null;
  const passwordError = passwordResult && !passwordResult.ok ? passwordResult : null;
  const passwordFieldError = passwordError?.fieldErrors?.password?.[0];
  const name = `${member.firstName} ${member.lastName}`;

  return (
    <section
      ref={rootRef}
      className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xs"
    >
      <h1 className="text-xl font-semibold break-words">{name}</h1>
      {phase === "password" ? (
        <form action={passwordAction} className="mt-6 flex flex-col gap-4" noValidate>
          <p className="text-sm text-muted-foreground">{PIN_LOCK_ERROR}</p>
          <input type="hidden" name="memberId" value={member.id} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="device-password" className="text-sm font-medium">
              Lozinka
            </label>
            <Input
              id="device-password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              aria-invalid={passwordFieldError ? true : undefined}
              aria-describedby={passwordFieldError ? "device-password-error" : undefined}
            />
            {passwordFieldError ? (
              <p id="device-password-error" className="text-sm text-destructive">
                {passwordFieldError}
              </p>
            ) : null}
          </div>
          {passwordError && !passwordFieldError ? (
            <p role="alert" className="text-sm text-destructive">
              {passwordError.error}
            </p>
          ) : null}
          <Button type="submit" disabled={passwordPending}>
            {passwordPending ? "Prijava u toku…" : "Prijavi se"}
          </Button>
          <Button type="button" variant="outline" onClick={onLeave}>
            Nazad na imena
          </Button>
        </form>
      ) : (
        <form ref={formRef} action={pinAction} className="mt-6 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">Unesite PIN od 6 cifara.</p>
          <input type="hidden" name="memberId" value={member.id} />
          <Input
            name="pin"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            maxLength={6}
            value={pin}
            spellCheck={false}
            aria-label="PIN"
            aria-invalid={pinError ? true : undefined}
            aria-describedby={pinError ? "pin-error" : undefined}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="h-16 text-center text-4xl tracking-[0.4em] text-foreground"
          />
          <div className="grid grid-cols-3 gap-2">
            {DIGITS.map((digit) => (
              <PinKey
                key={digit}
                digit={digit}
                disabled={pinPending || pin.length >= 6}
                onPress={() => appendPin(digit)}
              />
            ))}
            <span aria-hidden="true" />
            <PinKey digit="0" disabled={pinPending || pin.length >= 6} onPress={() => appendPin("0")} />
            <span aria-hidden="true" />
          </div>
          {pinError ? (
            <p id="pin-error" role="alert" className="text-sm text-destructive">
              {pinError}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={pinPending || pin.length === 0}
            onClick={() => setPin((current) => current.slice(0, -1))}
          >
            Obriši
          </Button>
          <Button type="button" variant="outline" onClick={onLeave}>
            Nazad na imena
          </Button>
        </form>
      )}
    </section>
  );
}

function PinKey({
  digit,
  disabled,
  onPress,
}: {
  digit: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Button type="button" variant="outline" className="h-14 text-2xl" disabled={disabled} onClick={onPress}>
      {digit}
    </Button>
  );
}
