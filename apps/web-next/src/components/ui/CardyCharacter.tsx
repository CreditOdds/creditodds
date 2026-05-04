// Shared "Cardy" character — the cartoon credit-card mascot used by
// onboarding prompts (DataPointPrompt) and compare suggestions
// (CardyComparePopup). Keep visuals consistent across surfaces.

interface CardyCharacterProps {
  size?: 'sm' | 'md';
}

export default function CardyCharacter({ size = 'md' }: CardyCharacterProps) {
  const isSm = size === 'sm';
  return (
    <div
      className={`relative rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg ${
        isSm ? 'w-16 h-[42px]' : 'w-28 h-[72px]'
      }`}
    >
      <div
        className={`absolute rounded-sm bg-yellow-300/80 ${
          isSm ? 'top-1.5 left-1.5 w-3.5 h-2.5' : 'top-3 left-3 w-6 h-[18px]'
        }`}
      >
        <div className="absolute inset-0.5 border border-yellow-500/40 rounded-[1px]" />
      </div>
      <div
        className={`absolute flex ${
          isSm ? 'top-1.5 right-2 gap-1' : 'top-3 right-4 gap-2'
        }`}
      >
        <div
          className={`rounded-full bg-white flex items-center justify-center ${
            isSm ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5'
          }`}
        >
          <div
            className={`rounded-full bg-indigo-900 ${
              isSm ? 'w-[3px] h-[3px]' : 'w-1 h-1'
            }`}
          />
        </div>
        <div
          className={`rounded-full bg-white flex items-center justify-center ${
            isSm ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5'
          }`}
        >
          <div
            className={`rounded-full bg-indigo-900 ${
              isSm ? 'w-[3px] h-[3px]' : 'w-1 h-1'
            }`}
          />
        </div>
      </div>
      <div
        className={`absolute border-b-2 border-white/80 rounded-b-full ${
          isSm ? 'bottom-1.5 right-2.5 w-2.5 h-1' : 'bottom-3 right-5 w-4 h-2'
        }`}
      />
      <div
        className={`absolute flex flex-col ${
          isSm ? 'bottom-1.5 left-1.5 gap-[1px]' : 'bottom-3 left-3 gap-0.5'
        }`}
      >
        <div
          className={`bg-indigo-400/40 rounded-full ${
            isSm ? 'w-4 h-[1px]' : 'w-8 h-0.5'
          }`}
        />
        <div
          className={`bg-indigo-400/40 rounded-full ${
            isSm ? 'w-3 h-[1px]' : 'w-6 h-0.5'
          }`}
        />
      </div>
    </div>
  );
}
