import { loadGpus, loadLaptops, type GpuEntry, type LaptopEntry } from "../../lib/data/load";
import { Field, helpId } from "../../components/ui/Field";

export function DeviceLookup({
  onPickGpu,
  onPickLaptop,
}: {
  onPickGpu: (gpu: GpuEntry) => void;
  onPickLaptop: (laptop: LaptopEntry) => void;
}) {
  const gpus = loadGpus();
  const laptops = loadLaptops();

  return (
    <>
      <Field
        label="Graphics card"
        htmlFor="gpu-lookup"
        help="Pick your card to fill in its video memory. Not listed? Type it in yourself."
        hint="Auto-fills the field below — always editable."
      >
        <select
          id="gpu-lookup"
          className="select"
          defaultValue=""
          aria-describedby={helpId("gpu-lookup")}
          onChange={(e) => {
            const gpu = gpus.find((g) => g.id === e.target.value);
            if (gpu) onPickGpu(gpu);
          }}
        >
          <option value="">Select a graphics card…</option>
          {gpus.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Laptop"
        htmlFor="laptop-lookup"
        help="Fills in the GPU, memory size and memory type all at once."
        hint="Everything it fills stays editable."
      >
        <select
          id="laptop-lookup"
          className="select"
          defaultValue=""
          aria-describedby={helpId("laptop-lookup")}
          onChange={(e) => {
            const laptop = laptops.find((l) => l.id === e.target.value);
            if (laptop) onPickLaptop(laptop);
          }}
        >
          <option value="">Select a laptop…</option>
          {laptops.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}
