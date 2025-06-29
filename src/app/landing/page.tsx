"use client";

import { DebugBorder, DebugGrid, Menubar, Space } from "@/src/components";
import { ENV, multiLine } from "@/src/lib";
import { LANDING_CONTENT } from "./constants";

// Main Landing Component
const LandingView = () => {
  const { title, subtitle, features, description, cta, sections, trustIndicators } = LANDING_CONTENT;

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const goToDashboard = () => {
    window.location.href = '/dashboard';
  };

  return (
    <div id="top" className="max-w-6xl mx-auto px-6">
      {/* Hero Section */}
      <div className="text-center pt-24 pb-32">
        {/* Main Title with Enhanced Typography */}
        <div className="mb-12 px-4">
          <h1 className="hero-title mb-2 text-center">{title.main}</h1>
          <h2 className="hero-title text-center">{title.secondary}</h2>
        </div>

        {/* Subtitle with Better Visual Treatment */}
        <div className="mb-16 px-4">
          <div className="hero-subtitle mb-8 max-w-4xl mx-auto">
            {multiLine(subtitle, 3, 2)}
          </div>
          {/* Decorative Element */}
          <div className="flex justify-center items-center space-x-4 mb-12">
            <div className="w-16 decorative-line from-transparent via-blue-400 to-transparent"></div>
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            <div className="w-24 decorative-line from-blue-400 via-purple-400 to-blue-400"></div>
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
            <div className="w-16 decorative-line from-transparent via-purple-400 to-transparent"></div>
          </div>
        </div>

        {/* Enhanced CTA Section */}
        <div className="mb-20">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <button onClick={goToDashboard} className="group cta-button-primary">
              <span className="relative z-10">{cta.primary}</span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            </button>
            <button onClick={() => scrollToSection('features')} className="group cta-button-secondary">
              <span className="relative z-10">{cta.secondary}</span>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/10 to-purple-500/0 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></div>
            </button>
          </div>

          {/* Trust Indicators */}
          <div className="mt-12 flex items-center justify-center space-x-8 text-sm text-gray-400">
            {trustIndicators.map((indicator, index) => {
              const circleColor = indicator.color === 'green' ? 'bg-green-400' :
                indicator.color === 'blue' ? 'bg-blue-400' :
                  indicator.color === 'purple' ? 'bg-purple-400' : 'bg-gray-400';

              return (
                <div key={index} className="trust-indicator">
                  <div className={`w-2 h-2 rounded-full ${circleColor}`}></div>
                  <span>{indicator.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* About Section */}
      <div id="about" className="max-w-4xl mx-auto mb-32 pt-16">
        <div className="text-center mb-16">
          <h3 className="section-header">{LANDING_CONTENT.sections.about.title}</h3>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">{LANDING_CONTENT.sections.about.subtitle}</p>
          <div className="w-24 h-1 bg-gradient-to-r from-blue-400 to-purple-400 mx-auto mt-4"></div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {features.map((feature, index) => (
            <div key={feature} className="group feature-card" style={{ animationDelay: `${index * 100}ms` }}>
              <h3 className="text-xl font-semibold text-white mb-4 group-hover:text-blue-200 transition-colors duration-300">{feature}</h3>
              <div className="w-16 h-1 bg-gradient-to-r from-blue-400 to-purple-400 mx-auto rounded-full group-hover:w-24 transition-all duration-300"></div>
            </div>
          ))}
        </div>

        {/* Description Content */}
        <div className="space-y-12 text-center">
          <div className="prose prose-lg prose-invert mx-auto max-w-3xl">
            <p className="text-xl leading-relaxed text-gray-300 mb-8">{description.intro}</p>
            <p className="text-lg leading-relaxed text-gray-400 mb-8">{description.mission}</p>
            <p className="text-lg leading-relaxed text-gray-400">{description.legacy}</p>
          </div>
        </div>
      </div>

      {/* Contact Section */}
      <div id="contact" className="max-w-4xl mx-auto mb-32 pt-16">
        <div className="text-center mb-16">
          <h3 className="section-header">{LANDING_CONTENT.sections.contact.title}</h3>
          <div className="w-24 h-1 bg-gradient-to-r from-blue-400 to-purple-400 mx-auto"></div>
        </div>

        <div className="text-center">
          <div className="glass-card p-12 max-w-2xl mx-auto">
            <p className="text-xl text-gray-300 mb-8">{LANDING_CONTENT.sections.contact.greeting}</p>
            <p className="text-lg text-gray-400 mb-8">{LANDING_CONTENT.sections.contact.comingSoon}</p>

            <div className="space-y-4">
              {LANDING_CONTENT.sections.contact.status.map((status, index) => (
                <div key={index} className="flex items-center justify-center space-x-4">
                  <div className={`w-3 h-3 rounded-full animate-pulse ${index === 0 ? 'bg-blue-400' : 'bg-purple-400'}`}
                    style={index === 1 ? { animationDelay: '0.5s' } : {}}></div>
                  <span className="text-gray-400">{status}</span>
                </div>
              ))}
            </div>

            {/* Final CTA */}
            <div className="pt-12">
              <div className="inline-flex items-center space-x-4">
                <button onClick={goToDashboard} className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-full font-medium hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1">
                  {cta.getStarted}
                </button>
                <button onClick={() => scrollToSection('features')} className="border border-white/20 text-white px-8 py-4 rounded-full font-medium hover:bg-white/10 transition-all duration-300">
                  {cta.secondary}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Landing() {
  return (
    <>
      {ENV.isDevelopment && (
        <>
          <DebugBorder />
          <DebugGrid />
        </>
      )}
      <Space />
      <div className="glass" style={{ display: "flex", flexDirection: "column" }}>
        <Menubar />
        <div style={{ flex: 1, overflow: "auto", overscrollBehavior: "contain" }}>
          <main className="m-10">
            <div className="m-5 pt-10">
              <LandingView />
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
