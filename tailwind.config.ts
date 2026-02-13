import plugin from "tailwindcss/plugin";
import { PluginAPI } from "tailwindcss/types/config";

module.exports = {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		backgroundImage: {
  			'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
  			'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))'
  		},
  		spacing: {
  			'1p': '1%',
  			'2p': '2%',
  			'3p': '3%',
  			'4p': '4%',
  			'5p': '5%',
  			'6p': '6%',
  			'7p': '7%',
  			'8p': '8%',
  			'9p': '9%',
  			'10p': '10%',
  			'11p': '11%',
  			'12p': '12%',
  			'13p': '13%',
  			'14p': '14%',
  			'15p': '15%',
  			'16p': '16%',
  			'17p': '17%',
  			'18p': '18%',
  			'19p': '19%',
  			'20p': '20%',
  			'21p': '21%',
  			'22p': '22%',
  			'23p': '23%',
  			'24p': '24%',
  			'25p': '25%',
  			'26p': '26%',
  			'27p': '27%',
  			'28p': '28%',
  			'29p': '29%',
  			'30p': '30%'
  		},
  		fontSize: {
  			'10xl': '10rem',
  			'11xl': '11rem',
  			'12xl': '12rem',
  			'13xl': '13rem',
  			'14xl': '14rem',
  			'15xl': '15rem',
  			'16xl': '16rem',
  			'17xl': '17rem',
  			'18xl': '18rem',
  			'19xl': '19rem',
  			'20xl': '20rem'
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		}
  	}
  },
  plugins: [
    plugin(function (api: PluginAPI) {
      const { addUtilities } = api;

      const textStrokeUtilities = {
        ".text-stroke-1": {
          "-webkit-text-stroke-width": "1px",
        },
        ".text-stroke-2": {
          "-webkit-text-stroke-width": "2px",
        },
        ".text-stroke-3": {
          "-webkit-text-stroke-width": "3px",
        },
        ".text-stroke-4": {
          "-webkit-text-stroke-width": "4px",
        },
        ".text-stroke-5": {
          "-webkit-text-stroke-width": "5px",
        },
        ".text-stroke-white": {
          "-webkit-text-stroke-color": "white",
        },
        ".text-stroke-black": {
          "-webkit-text-stroke-color": "black",
        },
      };
      addUtilities(textStrokeUtilities);
    }),
      require("tailwindcss-animate")
],
};
