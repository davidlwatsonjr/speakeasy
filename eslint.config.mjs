import parser from '@typescript-eslint/parser';
import jsxA11y from 'eslint-plugin-jsx-a11y';
export default [{
  files:['src/**/*.tsx'],
  languageOptions:{parser,parserOptions:{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true}}},
  plugins:{'jsx-a11y':jsxA11y},
  rules:{
    'jsx-a11y/alt-text':'error',
    'jsx-a11y/aria-props':'error',
    'jsx-a11y/aria-proptypes':'error',
    'jsx-a11y/aria-role':'error',
    'jsx-a11y/role-has-required-aria-props':'error',
    'jsx-a11y/anchor-is-valid':'error',
    'jsx-a11y/label-has-associated-control':'error',
  }
}];
