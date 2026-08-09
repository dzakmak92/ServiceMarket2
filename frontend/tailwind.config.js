/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        // ServiceMarket brand colors
        cream: '#fdf3e3',
        'cream-soft': '#fef7ea',
        'cream-deep': '#f9e9cf',
        paper: '#ffffff',
        // The two lighter greys used to fail WCAG AA on every surface they
        // appear on — muted at 2.94–3.52:1, faint at 1.68–2.01:1 — and
        // because almost all of this text is 8–11 px, none of it qualified
        // for the 3:1 large-text allowance. They are darkened here rather
        // than per-component so nothing new can be built on a failing pair.
        //
        // The values are the *lightest* that clear 4.5:1 on the darkest
        // surface each is used on (cream-deep), blended toward the brand ink
        // so the family is unchanged. The ladder still reads in the right
        // order — ink 0.038 < soft 0.099 < muted 0.120 < faint 0.142 in
        // relative luminance — which nearly did not survive: at these sizes
        // AA pushes both greys so far down that the hierarchy has to be
        // aimed for deliberately rather than falling out of the numbers.
        ink: { DEFAULT: '#1a3a52', soft: '#4a5a6c', muted: '#4d6477', faint: '#566c7e' },
        // `tint` is a third step mixed from the same hue, not a new colour.
        // The home tiles run a light-to-dark ramp down each column and three
        // values are the minimum that reads as a progression rather than as
        // two colours and an accident.
        teal: { DEFAULT: '#2d6a7f', deep: '#1f4d5e', tint: '#cfdee3' },
        // Weather, and only weather. A cool family of its own so the forecast
        // can never be misread as an appointment. Tailwind ships a `sky`
        // scale; this replaces it, which is safe because nothing in the app
        // uses sky-50…sky-950 — and it is the blue the mockups were drawn in.
        // Without this the weather card's classes matched no colour at all
        // and it rendered flat white with a grey border.
        // `pale` is the mockup's rgba(91,143,176,.08) resolved to an opaque
        // colour. It has to be opaque: the mockup drew that wash over white,
        // but the calendar page is warm cream, and 8% of a cool blue over
        // #fdf3e3 cancels to grey — the card stopped reading as blue at all.
        sky: { DEFAULT: '#5b8fb0', deep: '#3d6c8a', tint: '#dde9f0', pale: '#eef4f9' },
        // `deep` is a fill, not a text colour: on white it is 2.03:1, so the
        // "free days" figure printed in it failed AA at 15 px. `text` is the
        // same hue darkened until it clears 4.5:1 on every cream surface —
        // use it whenever amber has to be read rather than looked at.
        amber: { DEFAULT: '#f5a623', deep: '#e8941a', tint: '#fbe0b4', text: '#905e11' },
        // Foreground for text sitting on an amber fill. The brand ink is a
        // blue navy and goes muddy on orange; this is the same hue family as
        // the amber itself, darkened. Named for its job, not its colour.
        'on-amber': '#3a2a08',
        // The home screen's six workflow tiles and the focus card above them.
        //
        // Their own family, not `amber` and `teal`, because those two are the
        // brand: they colour every button, the calendar, the weather card and
        // the quote header. The tiles were drawn straight from them at full
        // saturation, so six saturated blocks sat directly under a saturated
        // focus card and nothing on the screen led. Desaturating the brand to
        // fix that would have repainted the whole app.
        //
        // So the ramps below are the brand's two hues at roughly 40% of their
        // chroma — still recognisably warm-left and cool-right, still running
        // light to dark down each column, but reading as card stock rather
        // than as signal. `warm` takes `on-amber` for text and `cool` takes
        // `ink`; both were checked at 4.87:1 or better on their own fill,
        // which is why no new text colour was needed.
        stage: {
          w1: '#f5ecdc', w2: '#e9d8ba', w3: '#d9c39c',
          c1: '#93aab0', c2: '#b8cacd', c3: '#dde6e7',
        },
        // The focus card, and the one measurement that decided it.
        //
        // The card began as brand teal at 45% saturation with a 71% amber
        // button, sitting directly above tiles at 15-17% and 44-56%. It was
        // three times the chroma of everything beneath it, which is why no
        // choice of a nicer teal ever made it sit right — the problem was
        // never the hue.
        //
        // So these are not picked colours. `DEFAULT` is the cool tile ramp
        // continued downward — the same hue and saturation as `stage.c1`, two
        // steps darker — and `cta` is the warm ramp continued the same way.
        // The card stays the heaviest thing on the screen, which is its job,
        // without being the only saturated one.
        //
        // `sub` is the kicker and the meta line; on this fill it reaches
        // 5.47:1, and `on-cta` reaches 6.59:1 on the button.
        focus: {
          DEFAULT: '#3e5155', cta: '#c9aa73',
          sub: '#c8d3d5', 'on-cta': '#33270f',
        },
        'green-pos': '#4a8b3f',
        'red-warn': '#c14655',
        'sm-border': '#f0e3c8',
        // Shadcn system
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: { '1': 'hsl(var(--chart-1))', '2': 'hsl(var(--chart-2))', '3': 'hsl(var(--chart-3))', '4': 'hsl(var(--chart-4))', '5': 'hsl(var(--chart-5))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        '18': '18px',
        '14': '14px',
      },
      fontFamily: {
        headings: ['"Bricolage Grotesque"', 'sans-serif'],
        // Inter first for anyone who has it installed, then the platform's
        // own UI face. No webfont is downloaded — see public/index.html.
        body: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'fade-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(20px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
