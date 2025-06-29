import { type Article } from "@/src/lib";

interface ArticleCardProps {
  article: Article;
}

export const ArticleCard = ({ article }: ArticleCardProps) => (
  <div className="article-card group">
    <div className="flex flex-col h-full">
      <h3 className="article-card-title group-hover:text-blue-200">
        {article.title}
      </h3>

      <p className="article-card-content">
        {article.content || "No description available"}
      </p>

      <div className="article-card-footer">
        <span className="article-card-date">
          {new Date(article.publication_date || Date.now()).toLocaleDateString()}
        </span>
        <a
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          className="cta-button-secondary !py-2 !px-4 !text-sm inline-flex items-center space-x-2"
          onClick={(e) => e.stopPropagation()}
        >
          <span>Read More</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  </div>
);
