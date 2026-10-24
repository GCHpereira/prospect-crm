"use client";
import { useRouter } from "next/navigation";
import { LeadForm } from "@/components/LeadForm";
import { useStore } from "@/lib/store";
import { dedupeKey } from "@/lib/dedupe";

export default function NovoLead() {
  const { addLead, leads } = useStore();
  const router = useRouter();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Novo lead</h1>
      <LeadForm
        submitLabel="Cadastrar lead"
        onSubmit={(f) => {
          const dup = leads.find(
            (l) => (f.google_place_id && l.google_place_id === f.google_place_id) || (f.cnpj && l.cnpj === f.cnpj) || dedupeKey(l.nome, l.cidade) === dedupeKey(f.nome, f.cidade),
          );
          if (dup && !confirm(`Já existe "${dup.nome}" (${dup.cidade}). Cadastrar mesmo assim?`)) return;
          const id = addLead({ ...f, origem: "manual", possivel_duplicado_de: dup?.id ?? "" });
          router.push(`/leads/${id}`);
        }}
      />
    </div>
  );
}
