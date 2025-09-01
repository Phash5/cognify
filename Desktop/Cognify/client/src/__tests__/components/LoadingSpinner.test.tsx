import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from '../../components/UI/LoadingSpinner';

describe('LoadingSpinner Component', () => {
  it('should render with default props', () => {
    render(<LoadingSpinner />);
    
    const spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('role', 'status');
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
  });

  it('should apply correct size classes', () => {
    const { rerender } = render(<LoadingSpinner size="sm" />);
    let spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toHaveClass('w-4', 'h-4');

    rerender(<LoadingSpinner size="md" />);
    spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toHaveClass('w-6', 'h-6');

    rerender(<LoadingSpinner size="lg" />);
    spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toHaveClass('w-8', 'h-8');

    rerender(<LoadingSpinner size="xl" />);
    spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toHaveClass('w-12', 'h-12');
  });

  it('should apply correct color classes', () => {
    const { rerender } = render(<LoadingSpinner color="primary" />);
    let spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toHaveClass('border-blue-500');

    rerender(<LoadingSpinner color="secondary" />);
    spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toHaveClass('border-gray-500');

    rerender(<LoadingSpinner color="white" />);
    spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toHaveClass('border-white');
  });

  it('should apply custom className', () => {
    render(<LoadingSpinner className="custom-class" />);
    
    const spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toHaveClass('custom-class');
  });

  it('should have spinning animation class', () => {
    render(<LoadingSpinner />);
    
    const spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toHaveClass('animate-spin');
  });

  it('should have transparent top border for spinning effect', () => {
    render(<LoadingSpinner />);
    
    const spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toHaveClass('border-t-transparent');
  });

  it('should be rounded', () => {
    render(<LoadingSpinner />);
    
    const spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toHaveClass('rounded-full');
  });

  it('should combine multiple props correctly', () => {
    render(
      <LoadingSpinner 
        size="lg" 
        color="white" 
        className="my-custom-class" 
      />
    );
    
    const spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toHaveClass('w-8', 'h-8', 'border-white', 'my-custom-class');
  });
});