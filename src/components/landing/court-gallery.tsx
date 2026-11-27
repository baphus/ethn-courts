export const courtPhotos = [
  { file: "c9Uh1G3i.jpg", caption: "Two courts, one view", alt: "Wide view of both outdoor pickleball courts under a cloudy sky" },
  { file: "Bb0_EPB6.jpg", caption: "Courtside with a view", alt: "Pickleball net and painted court lines with hills in the background" },
  { file: "GB8lSjyf.jpg", caption: "From the baseline", alt: "Blue and orange pickleball court viewed from behind the baseline" },
  { file: "pt1QP2Ca.jpg", caption: "Up close at the net", alt: "Close-up of a pickleball net running diagonally across the court" },
  { file: "7Jx3G6MX.jpg", caption: "A look at the lines", alt: "White lines across the blue and orange playing surface" },
  { file: "meLLCsZY.jpg", caption: "Another look around the courts", alt: "Another view of the outdoor pickleball courts at ETHN" },
];

export default function CourtGallery() {
  return (
    <section id="court-gallery" aria-labelledby="court-gallery-title" className="landing-type bg-white px-0 py-8 text-[#17252e] sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="px-4 pb-5 sm:px-6">
          <div className="flex items-center gap-5">
            <div aria-hidden="true" className="size-[76px] shrink-0 rounded-full bg-gradient-to-tr from-[#ffad4c] via-[#ed5b63] to-[#8b55c8] p-[3px] sm:size-20">
              <div className="grid size-full place-items-center rounded-full bg-white p-1"><img src="/ethn_courts_logo-3.svg" alt="" className="size-full rounded-full object-cover" /></div>
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="court-gallery-title" className="text-lg font-semibold leading-tight">ethn.courts</h2>
              <p className="mt-1 text-sm">ETHN Courts</p>
              <p className="mt-1 text-xs text-[#60716a]">Cebu · Pickleball courts</p>
            </div>
          </div>
          <p className="mt-4 text-sm">Your next game starts here. Book a court and play.</p>
          <a href="/book" className="public-cta-primary mt-3 flex min-h-10 w-full items-center justify-center rounded-md px-5 text-sm font-bold transition-colors">Book a court <span aria-hidden="true" className="ml-2">→</span></a>
        </header>
        <div aria-hidden="true" className="mb-1 border-b border-[#e7e7e7]"><div className="mx-auto h-0.5 w-16 bg-[#17252e]" /></div>
        <div aria-label="Court photos" className="grid grid-cols-3 gap-[2px]">
          {courtPhotos.map((photo) => (
            <img key={photo.file} src={`/court-gallery/${photo.file}`} alt={photo.alt} loading="lazy" className="block aspect-[4/5] w-full object-cover transition hover:brightness-95" />
          ))}
        </div>
      </div>
    </section>
  );
}
